import type { BatchRepository, PendingLeadRow, ActiveWindowBatch } from "../interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../../campaigns/application/interfaces/campaign-repository.interface";
import type { BolnaBatchProvider } from "../interfaces/bolna-batch-provider.interface";
import type { CallingWindowService } from "../../../campaigns/application/services/calling-window.service";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type { LeadBatchEntityData } from "../../domain/entities/lead-batch.entity";
import {
  getCarryForwardWindowStart,
  getWindowBounds,
  getWindowState,
} from "../../../../shared/utils/calling-window";
import { toBolnaISO, parseBolnaScheduledTime } from "../../../../shared/utils/bolna-date";
import { transformToBolnaCSV } from "../../infrastructure/csv-transformer";
import { generateBolnaBatchFilename } from "../../domain/rules/bolna-filename.rules";
import type { LeadRow } from "../../../leads/infrastructure/leadParser";
import { env } from "../../../../shared/config/env";

export interface CloseCallingWindowsResult {
  scanned: number;
  paused: string[];
  scheduled: string[];
  skipped: string[];
  failed: Array<{ batchId: string; error: string }>;
}

/**
 * D2/D4: when a calling window closes, stop future dialing at the provider and
 * carry pending work into a successor batch scheduled for the next window.
 *
 * In-flight calls are deliberately left alone: local CALLING calls/leads are
 * never force-stopped (unlike StopBatchUseCase). The persisted windowPausedAt
 * marker makes repeated scheduler ticks idempotent.
 */
export class CloseCallingWindowsUseCase {
  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly bolnaProvider: BolnaBatchProvider,
    private readonly callingWindowService: CallingWindowService,
    private readonly logger?: Logger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<CloseCallingWindowsResult> {
    const at = this.clock();
    const result: CloseCallingWindowsResult = {
      scanned: 0,
      paused: [],
      scheduled: [],
      skipped: [],
      failed: [],
    };

    const activeBatches =
      await this.batchRepo.findActiveBatchesAwaitingWindowClose();
    result.scanned = activeBatches.length;

    for (const batch of activeBatches) {
      try {
        await this.processBatch(batch, at, result);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        result.failed.push({ batchId: batch.id, error });
        this.logger?.error("Failed to close calling window for batch", err, {
          action: "batch.calling_window.close_failed",
          batchId: batch.id,
          tenantId: batch.tenantId,
        });
      }
    }

    return result;
  }

  private async processBatch(
    batch: ActiveWindowBatch,
    at: Date,
    result: CloseCallingWindowsResult,
  ): Promise<void> {
    const window = await this.callingWindowService.resolveWindow(
      batch.tenantId,
      batch.campaignId,
    );
    if (!window) {
      result.skipped.push(batch.id);
      return;
    }

    const state = getWindowState(window, at);
    if (state === "OPEN" || state === "BEFORE_OPEN") {
      result.skipped.push(batch.id);
      return;
    }

    const windowEnd = getWindowBounds(window, at).end;
    const leads = await this.batchRepo.findCarryForwardLeads(
      batch.id,
      windowEnd,
    );

    // D2: only the provider's dialer is stopped; local CALLING calls/leads stay.
    if (batch.bolnaBatchId) {
      await this.bolnaProvider.stopBatch(batch.tenantId, batch.bolnaBatchId);
    }

    // Claim the marker before creating a successor so duplicate ticks cannot
    // produce duplicate carry-forward batches.
    const claimed = await this.batchRepo.markWindowPaused(batch.id, at);
    if (!claimed) {
      result.skipped.push(batch.id);
      return;
    }
    result.paused.push(batch.id);

    const nextStart = getCarryForwardWindowStart(window, at);
    if (leads.length === 0 || !nextStart) {
      return;
    }

    const successorId = await this.createSuccessorBatch(
      batch,
      leads,
      nextStart,
      at,
    );
    if (successorId) {
      result.scheduled.push(successorId);
    }
  }

  private async createSuccessorBatch(
    batch: ActiveWindowBatch,
    leads: PendingLeadRow[],
    nextStart: Date,
    at: Date,
  ): Promise<string | null> {
    const campaign = await this.campaignRepo.findByIdWithRelations(
      batch.tenantId,
      batch.campaignId,
    );
    if (!campaign?.assistant) {
      this.logger?.warn("Cannot carry forward batch without a Bolna assistant", {
        action: "batch.calling_window.no_assistant",
        batchId: batch.id,
        campaignId: batch.campaignId,
      });
      return null;
    }

    const source: LeadBatchEntityData | null = await this.batchRepo.findById(
      batch.tenantId,
      batch.campaignId,
      batch.id,
    );

    const successor = await this.batchRepo.create({
      name: `Calling window carry-forward - ${source?.name ?? source?.fileName ?? batch.id}`,
      campaignId: batch.campaignId,
      tenantId: batch.tenantId,
      provider: "BOLNA",
      fileName: `window-carry-forward-${batch.id}`,
      totalLeads: leads.length,
      retryConfig: source?.retryConfig,
      termsAccepted: source?.termsAccepted ?? true,
      termsAcceptedAt: at,
      termsVersion: source?.termsVersion ?? "v1",
    });

    await this.batchRepo.reassignLeadsByIdsToBatch(
      leads.map((lead) => lead.id),
      successor.id,
    );

    const variables = (campaign.variables as Record<string, string>) ?? {};
    const leadRows: LeadRow[] = leads.map((lead) => ({
      name: lead.name,
      phone: lead.phone,
      email: lead.email ?? undefined,
      company: lead.company ?? undefined,
      ...(lead.metadata ?? {}),
    }));

    const { transformedBuffer } = transformToBolnaCSV(leadRows, variables);
    const webhookUrl = env.webhook.baseUrl
      ? `${env.webhook.baseUrl}/api/webhooks/bolna-batch`
      : undefined;

    const sequenceNumber = await this.batchRepo.getBatchSequenceNumber(
      batch.campaignId,
      successor.id,
    );
    const bolnaFileName = generateBolnaBatchFilename({
      sequenceNumber,
      batchId: successor.id,
      campaignName: campaign.name,
      campaignId: batch.campaignId,
    });

    const bolnaResult = await this.bolnaProvider.createBatch(batch.tenantId, {
      agentId: campaign.assistant.platformAgent.bolnaId,
      csvBuffer: transformedBuffer,
      fileName: bolnaFileName,
      retryConfig: (source?.retryConfig ?? { enabled: false }) as never,
      webhookUrl,
    });

    const scheduleResult = await this.bolnaProvider.scheduleBatch(
      batch.tenantId,
      bolnaResult.batch_id,
      toBolnaISO(nextStart),
    );
    const bolnaScheduledAt = parseBolnaScheduledTime(scheduleResult.state);

    await this.batchRepo.update(successor.id, {
      bolnaBatchId: bolnaResult.batch_id,
      status: "SCHEDULED",
      scheduledAt: nextStart,
      bolnaScheduledAt: bolnaScheduledAt ?? nextStart,
    });

    this.logger?.info("Calling window work carried forward", {
      action: "batch.calling_window.carried_forward",
      tenantId: batch.tenantId,
      campaignId: batch.campaignId,
      sourceBatchId: batch.id,
      successorBatchId: successor.id,
      leadCount: leads.length,
      scheduledAt: nextStart.toISOString(),
    });

    return successor.id;
  }
}
