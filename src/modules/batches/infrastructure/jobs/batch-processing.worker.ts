// modules/batches/infrastructure/jobs/batch-processing.worker.ts

import type { Job } from "bull";
import type { BatchRepository } from "../../application/interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../../campaigns/application/interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { BolnaBatchProvider } from "../../application/interfaces/bolna-batch-provider.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";
import {
  parseLeadBuffer,
  isIndianPhone,
  type LeadRow,
} from "../../../leads/infrastructure/leadParser";
import { normalizePhoneNumber } from "../../../leads/domain/rules/phone.rules";
import { transformToBolnaCSV } from "../csv-transformer";
import { env } from "../../../../shared/config/env";
import {
  toBolnaISO,
  parseBolnaScheduledTime,
} from "../../../../shared/utils/bolna-date";
import type { RetryConfig } from "../../../../shared/types/bolna.types";
import { toUserFriendlyError } from "../../domain/rules/batch-error-messages";
import axios from "axios";
import { assertTenantNotFrozen } from "../../../../shared/utils/tenant-freeze.guard";

export interface BatchJobData {
  batchId: string;
  tenantId: string;
  campaignId: string;
  rawFileUrl: string;
  fileName: string;
  scheduledAt: string | null;
  runImmediately: boolean;
  retryConfig: RetryConfig | null;
  termsVersion: string;
}

const CHUNK_SIZE = 500;

export class BatchProcessingWorker {
  private readonly log: Logger | undefined;

  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly planRepo: PlanRepository,
    private readonly bolnaProvider: BolnaBatchProvider,
    logger?: Logger,
  ) {
    this.log = logger?.child({ component: "BatchProcessingWorker" });
  }

  async process(job: Job<BatchJobData>): Promise<void> {
    const {
      batchId,
      tenantId,
      campaignId,
      rawFileUrl,
      fileName,
      scheduledAt,
      runImmediately,
      retryConfig,
    } = job.data;

    await assertTenantNotFrozen(tenantId);

    const existingBatch = await this.batchRepo.findById(
      tenantId,
      campaignId,
      batchId,
    );
    if (!existingBatch) {
      this.log?.warn(
        "Batch was deleted before processing started, aborting job",
        { action: "batch.worker.aborted_missing", batchId, tenantId },
      );
      return;
    }

    try {
      // ── STAGE 1: PARSE & VALIDATE ──────────────────────────────
      await this.batchRepo.updateProgress(batchId, "PARSING", 5);

      const fileResponse = await axios.get(rawFileUrl, {
        responseType: "arraybuffer",
        headers: { "Accept-Encoding": "identity" },
        timeout: 30_000,
      });
      const fileBuffer = Buffer.from(fileResponse.data);

      await this.batchRepo.updateProgress(batchId, "PARSING", 10);

      const { rows } = parseLeadBuffer(fileBuffer, fileName);
      if (rows.length === 0) {
        await this.failBatch(
          batchId,
          campaignId,
          "Uploaded file contains no data rows.",
        );
        return;
      }

      const normalizedRows = rows
        .filter((r) => r.phone && r.phone.trim() !== "")
        .map((r) => ({
          ...r,
          phone: normalizePhoneNumber(r.phone),
        }));

      const validRows = normalizedRows.filter((r) => isIndianPhone(r.phone));

      if (validRows.length === 0) {
        await this.failBatch(
          batchId,
          campaignId,
          "No valid contact numbers found in the uploaded file.",
        );
        return;
      }

      const seenInFile = new Set<string>();
      const uniqueRows: LeadRow[] = [];
      for (const row of validRows) {
        if (!seenInFile.has(row.phone)) {
          seenInFile.add(row.phone);
          uniqueRows.push(row);
        }
      }

      await this.batchRepo.updateProgress(batchId, "PARSING", 20);

      let newLeads = uniqueRows;
      if (!env.skipCrossBatchDedup) {
        const phones = uniqueRows.map((r) => r.phone);
        const existingPhones = new Set<string>();

        for (let i = 0; i < phones.length; i += 1000) {
          const chunk = phones.slice(i, i + 1000);
          const existing = await this.batchRepo.findExistingPhones(
            campaignId,
            chunk,
          );
          existing.forEach((p) => existingPhones.add(p));
        }

        newLeads = uniqueRows.filter((r) => !existingPhones.has(r.phone));
      }

      // ── EARLY EXIT ON 100% DUPLICATES ─────────────────────────
      if (newLeads.length === 0) {
        await this.failBatch(
          batchId,
          campaignId,
          `All ${uniqueRows.length} lead(s) are duplicates of existing leads in this campaign.`,
        );
        return;
      }

      const activePlan = await this.planRepo.getActivePlanForTenant(tenantId);
      if (
        activePlan &&
        activePlan.maxLeadsPerBatch !== null &&
        activePlan.maxLeadsPerBatch !== undefined &&
        newLeads.length > activePlan.maxLeadsPerBatch
      ) {
        await this.failBatch(
          batchId,
          campaignId,
          `Batch exceeds plan limit of ${activePlan.maxLeadsPerBatch} leads per batch (${newLeads.length} found).`,
        );
        return;
      }

      await this.batchRepo.updateProgress(batchId, "PARSING", 30);

      // ── STAGE 2: STORE & REASSIGN LEADS ─────────────────────────
      await this.batchRepo.updateProgress(batchId, "STORING", 35);

      for (let i = 0; i < newLeads.length; i += CHUNK_SIZE) {
        const chunk = newLeads.slice(i, i + CHUNK_SIZE);
        await this.batchRepo.createLeads(
          chunk.map((row) => ({
            name: row.name,
            phone: row.phone,
            email: row.email,
            company: row.company,
            tenantId,
            campaignId,
            batchId,
            metadata: row as Record<string, unknown>,
          })),
        );

        const progress = 35 + Math.round((i / newLeads.length) * 15);
        await this.batchRepo.updateProgress(batchId, "STORING", progress);
      }

      if (env.skipCrossBatchDedup) {
        const allPhones = newLeads.map((r) => r.phone);
        for (let i = 0; i < allPhones.length; i += 1000) {
          const chunk = allPhones.slice(i, i + 1000);
          await this.batchRepo.reassignCampaignLeadsToBatch(
            campaignId,
            batchId,
            chunk,
          );
        }
      }

      const pendingLeads = await this.batchRepo.findPendingLeads(batchId);
      const totalAvailable = pendingLeads.length;

      if (totalAvailable === 0) {
        await this.failBatch(
          batchId,
          campaignId,
          "No valid leads available to process in this batch.",
        );
        return;
      }

      await this.batchRepo.updateTotalLeads(batchId, totalAvailable);
      await this.batchRepo.updateProgress(batchId, "STORING", 60);

      // ── STAGE 3: BOLNA SYNC ─────────────────────────────────────
      await this.batchRepo.updateProgress(batchId, "SYNCING", 65);

      const campaign = await this.campaignRepo.findByIdWithRelations(
        tenantId,
        campaignId,
      );
      if (!campaign) {
        await this.failBatch(
          batchId,
          campaignId,
          "Campaign was deleted during processing.",
        );
        return;
      }

      if (!campaign.assistant) {
        await this.failBatch(
          batchId,
          campaignId,
          "Campaign assistant is not configured or missing.",
        );
        return;
      }

      const leadsForBolna: LeadRow[] = pendingLeads.map((l) => ({
        ...(l.metadata as Record<string, unknown>),
        phone: l.phone,
        name: l.name,
        email: l.email ?? undefined,
        company: l.company ?? undefined,
      }));

      const campaignVariables =
        (campaign.variables as Record<string, string>) ?? {};
      const { transformedBuffer } = transformToBolnaCSV(
        leadsForBolna,
        campaignVariables,
      );

      await this.batchRepo.updateProgress(batchId, "SYNCING", 75);

      const webhookUrl = env.webhook.baseUrl
        ? `${env.webhook.baseUrl}/api/webhooks/bolna-batch`
        : undefined;

      const bolnaResult = await this.bolnaProvider.createBatch(tenantId, {
        agentId: campaign.assistant.platformAgent.bolnaId,
        csvBuffer: transformedBuffer,
        fileName: `bolna-${batchId}.csv`,
        retryConfig: retryConfig ?? undefined,
        fromPhoneNumbers: [env.bolna.testNumber],
        webhookUrl,
      });

      const bolnaBatchId = bolnaResult.batch_id;
      await this.batchRepo.updateProgress(batchId, "SYNCING", 85);

      // ── STAGE 4: FINALIZE ──────────────────────────────────────
      await this.batchRepo.updateProgress(batchId, "FINALIZING", 90);

      let finalStatus: "CREATED" | "RUNNING" | "SCHEDULED" = "CREATED";
      let bolnaScheduledAt: Date | null = null;
      let localScheduledAt: Date | null = null;

      const targetScheduledDate = scheduledAt ? new Date(scheduledAt) : null;

      if (targetScheduledDate || runImmediately) {
        const scheduleTimeISO = toBolnaISO(targetScheduledDate ?? new Date());
        const scheduleRes = await this.bolnaProvider.scheduleBatch(
          tenantId,
          bolnaBatchId,
          scheduleTimeISO,
        );

        const parsedTimeStr = parseBolnaScheduledTime(scheduleRes.state);
        bolnaScheduledAt = parsedTimeStr ? new Date(parsedTimeStr) : null;
        localScheduledAt = targetScheduledDate ?? new Date();
        finalStatus = runImmediately ? "RUNNING" : "SCHEDULED";
      }

      const finalCheck = await this.batchRepo.findById(
        tenantId,
        campaignId,
        batchId,
      );
      if (!finalCheck) {
        this.log?.warn("Batch was deleted before finalize update, exiting", {
          batchId,
        });
        return;
      }

      await this.batchRepo.update(batchId, {
        bolnaBatchId,
        status: finalStatus,
        scheduledAt: localScheduledAt,
        bolnaScheduledAt,
      });

      await this.batchRepo.recalculateCampaignStats(campaignId);

      if (runImmediately && campaign.status === "DRAFT") {
        await this.campaignRepo.updateStatus(campaignId, "RUNNING", {
          startedAt: new Date(),
        });
      }

      await this.batchRepo.updateProgress(batchId, "FINALIZING", 100);

      this.log?.info("Batch processing complete", {
        action: "batch.worker.complete",
        batchId,
        tenantId,
        campaignId,
        totalLeads: totalAvailable,
        bolnaBatchId,
        finalStatus,
      });
    } catch (err) {
      const technicalMessage = err instanceof Error ? err.message : String(err);
      const maxAttempts = job.opts.attempts ?? 3;
      const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;

      this.log?.error("Batch processing failed", err, {
        action: "batch.worker.error",
        batchId,
        tenantId,
        campaignId,
        attempt: job.attemptsMade + 1,
        maxAttempts,
        isFinalAttempt,
        error: technicalMessage,
      });

      // Mark FAILED on the final attempt before Bull gives up
      if (isFinalAttempt) {
        await this.failBatch(batchId, campaignId, technicalMessage);
      }
      
      throw err;
    }
  }

  private async failBatch(
    batchId: string,
    campaignId: string,
    technicalError: string,
  ): Promise<void> {
    try {
      const userMessage = toUserFriendlyError(technicalError);
      await this.batchRepo.updateProcessingError(batchId, userMessage);

      // Recalculate stats so the campaign does not stay locked in PROCESSING
      await this.batchRepo.recalculateCampaignStats(campaignId);

      this.log?.warn("Batch marked as failed", {
        action: "batch.worker.failed",
        batchId,
        campaignId,
        userMessage,
      });
    } catch (err) {
      this.log?.error("Failed to mark batch as failed", err, { batchId });
    }
  }
}
