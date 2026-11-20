import prisma from "../../../../shared/config/database/prisma";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type { IBolnaClientFactory } from "../../../../shared/config/external/bolna/bolna-client.factory";
import type { ISarvamCampaignClient } from "../../../campaigns/infrastructure/clients/sarvam-campaign.client";
import type { ISarvamApiKeyEncryptionService } from "../../../sarvam-api-keys/application/interfaces/sarvam-api-key-encryption.interface";
import type {
  ICampaignStopAdapter,
  ProviderStopResult,
  ProviderStopTarget,
} from "../../application/interfaces/campaign-stop-adapter.interface";
import { providerStopTargetKey } from "../../domain/rules/provider-stop-actions";
import { decideCampaignStatusFromBatches } from "../../../campaigns/domain/rules/campaign-lifecycle.rules";
import { activeCampaignGuard } from "../../../campaigns/infrastructure/queries/campaign-lifecycle-guard";

const STOPPABLE_BATCH_STATUSES = ["RUNNING", "SCHEDULED"] as const;
const STOPPABLE_CALL_STATUSES = ["SCHEDULED", "CALLING", "PENDING"] as const;

type SarvamCancelTarget = {
  campaignId: string;
  sarvamCampaignId: string;
  organizationId: string;
  workspaceId: string;
  encryptedApiKey: string;
};

export interface PrismaCampaignStopAdapterDeps {
  bolnaClientFactory: IBolnaClientFactory;
  sarvamCampaignClient: Pick<ISarvamCampaignClient, "updateStatus">;
  sarvamEncryptionService: Pick<ISarvamApiKeyEncryptionService, "decrypt">;
  logger: Logger;
}

/**
 * U-05: applies local DB stops regardless of remote provider outcome, then
 * attempts honest remote Bolna/Sarvam stops per target. Remote failures are
 * returned as success=false so the orchestrator can queue retry without ever
 * reporting provider success.
 */
export class PrismaCampaignStopAdapter implements ICampaignStopAdapter {
  constructor(private readonly deps: PrismaCampaignStopAdapterDeps) {}

  async stop(
    tenantId: string,
    retryTargets: ProviderStopTarget[] = [],
  ): Promise<ProviderStopResult[]> {
    // A previous attempt already stopped these rows locally before its remote
    // call failed. Re-include them by identity so the remote stop is retried.
    const bolnaRetryIds = retryTargets
      .filter((t) => t.provider === "BOLNA" && t.kind === "BATCH")
      .map((t) => t.targetId);
    const sarvamRetryIds = retryTargets
      .filter((t) => t.provider === "SARVAM" && t.kind === "CAMPAIGN")
      .map((t) => t.targetId);

    const batches = await prisma.leadBatch.findMany({
      where: {
        tenantId,
        OR: [
          { status: { in: [...STOPPABLE_BATCH_STATUSES] } },
          ...(bolnaRetryIds.length > 0
            ? [{ id: { in: bolnaRetryIds } }]
            : []),
          ...(sarvamRetryIds.length > 0
            ? [{ campaignId: { in: sarvamRetryIds } }]
            : []),
        ],
      },
      include: {
        campaign: {
          include: {
            sarvamAgent: {
              include: { apiKey: true },
            },
          },
        },
      },
    });

    const results: ProviderStopResult[] = [];

    // 1) Local DB stops first — "local block" must be applied regardless of
    // remote provider outcome so execution cannot continue on this tenant.
    for (const batch of batches) {
      try {
        await this.stopBatchLocally(batch.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.deps.logger.error("Local batch stop failed during credit enforcement", err, {
          action: "wallet.enforcement.local_stop_failed",
          tenantId,
          batchId: batch.id,
          campaignId: batch.campaignId,
        });
        results.push({
          target: { provider: "LOCAL", kind: "BATCH", targetId: batch.id },
          success: false,
          error: message,
        });
      }
    }

    await this.finalizeAffectedCampaigns(
      [...new Set(batches.map((b) => b.campaignId))],
      tenantId,
    );

    // 2) Remote provider stops — best-effort per target, honest results.
    const bolnaTargets = batches.filter((b) => Boolean(b.bolnaBatchId));
    if (bolnaTargets.length > 0) {
      results.push(...(await this.stopBolnaBatches(tenantId, bolnaTargets)));
    }

    const sarvamCollection = this.collectSarvamCancelTargets(batches);
    results.push(...sarvamCollection.unresolvable);
    if (sarvamCollection.targets.length > 0) {
      results.push(
        ...(await this.cancelSarvamCampaigns(tenantId, sarvamCollection.targets)),
      );
    }

    // Never let a vanished/unresolvable retry target look like a confirmed
    // stop. Keep it failed so the incident stays OPEN for reconciliation.
    const confirmed = new Set(results.map((r) => providerStopTargetKey(r.target)));
    for (const target of retryTargets) {
      if (confirmed.has(providerStopTargetKey(target))) continue;
      results.push({
        target,
        success: false,
        error: "Provider stop target could not be resolved for retry",
      });
    }

    return results;
  }

  private async stopBatchLocally(batchId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.leadBatch.update({
        where: { id: batchId },
        data: { status: "STOPPED" },
      });

      const activeCalls = await tx.call.findMany({
        where: {
          batchId,
          status: { in: [...STOPPABLE_CALL_STATUSES] },
        },
        select: { id: true, leadId: true },
      });

      const callIds = activeCalls.map((c) => c.id);
      const scheduledOrActiveLeadIds = activeCalls.map((c) => c.leadId);

      if (callIds.length > 0) {
        await tx.call.updateMany({
          where: { id: { in: callIds } },
          data: {
            status: "STOPPED",
            endedAt: new Date(),
          },
        });
      }

      await tx.lead.updateMany({
        where: {
          batchId,
          OR: [
            { status: { in: ["PENDING", "CALLING"] } },
            ...(scheduledOrActiveLeadIds.length > 0
              ? [{ id: { in: scheduledOrActiveLeadIds } }]
              : []),
          ],
        },
        data: { status: "STOPPED", stoppedReason: "LOW_BALANCE" },
      });
    });
  }

  private async finalizeAffectedCampaigns(
    campaignIds: string[],
    tenantId: string,
  ): Promise<void> {
    for (const campaignId of campaignIds) {
      try {
        const batchRows = await prisma.leadBatch.findMany({
          where: { campaignId, isDeleted: false },
          select: { status: true },
        });
        const decision = decideCampaignStatusFromBatches(
          batchRows.map((b) => b.status),
        );

        if (decision.action !== "settle") continue;

        await prisma.campaign.updateMany({
          where: {
            id: campaignId,
            ...activeCampaignGuard(new Date(), {
              allowLowBalanceMarked: true,
            }),
          },
          data: { status: decision.status, completedAt: new Date() },
        });
      } catch (err) {
        this.deps.logger.error(
          "Failed to finalize campaign after local credit-enforcement stop",
          err,
          {
            action: "wallet.enforcement.campaign_finalize_failed",
            tenantId,
            campaignId,
          },
        );
      }
    }
  }

  private async stopBolnaBatches(
    tenantId: string,
    batches: Array<{ id: string; bolnaBatchId: string | null }>,
  ): Promise<ProviderStopResult[]> {
    const targets = batches.filter(
      (b): b is { id: string; bolnaBatchId: string } => Boolean(b.bolnaBatchId),
    );

    let bolnaClient: Awaited<
      ReturnType<IBolnaClientFactory["forTenant"]>
    > | null = null;

    try {
      bolnaClient = await this.deps.bolnaClientFactory.forTenant(tenantId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.deps.logger.warn("Could not resolve Bolna client during credit enforcement", {
        action: "wallet.enforcement.bolna_client_unavailable",
        tenantId,
        error: message,
        targetCount: targets.length,
      });
      return targets.map((batch) => ({
        target: { provider: "BOLNA", kind: "BATCH", targetId: batch.id },
        success: false,
        error: message,
      }));
    }

    const results: ProviderStopResult[] = [];
    for (const batch of targets) {
      try {
        await bolnaClient.batches.stop(batch.bolnaBatchId);
        results.push({
          target: { provider: "BOLNA", kind: "BATCH", targetId: batch.id },
          success: true,
          error: null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.deps.logger.warn("Bolna batch stop failed during credit enforcement", {
          action: "wallet.enforcement.bolna_stop_failed",
          tenantId,
          batchId: batch.id,
          bolnaBatchId: batch.bolnaBatchId,
          error: message,
        });
        results.push({
          target: { provider: "BOLNA", kind: "BATCH", targetId: batch.id },
          success: false,
          error: message,
        });
      }
    }
    return results;
  }

  private collectSarvamCancelTargets(
    batches: Array<{
      campaignId: string;
      campaign: {
        id: string;
        provider: string | null;
        sarvamCampaignId: string | null;
        sarvamAgentId: string | null;
        sarvamAgent: {
          apiKey: {
            organizationId: string;
            workspaceId: string;
            apiKeyEncrypted: string;
          } | null;
        } | null;
      };
    }>,
  ): { targets: SarvamCancelTarget[]; unresolvable: ProviderStopResult[] } {
    const byCampaign = new Map<string, SarvamCancelTarget>();
    const unresolvable: ProviderStopResult[] = [];

    for (const batch of batches) {
      const campaign = batch.campaign;
      if (!campaign?.sarvamCampaignId || campaign.provider !== "SARVAM") continue;
      if (byCampaign.has(campaign.id)) continue;
      if (unresolvable.some((r) => r.target.targetId === campaign.id)) continue;

      const apiKey = campaign.sarvamAgent?.apiKey;
      if (
        !apiKey?.organizationId ||
        !apiKey?.workspaceId ||
        !apiKey.apiKeyEncrypted
      ) {
        unresolvable.push({
          target: { provider: "SARVAM", kind: "CAMPAIGN", targetId: campaign.id },
          success: false,
          error: "Sarvam campaign credentials could not be resolved for enforcement stop",
        });
        continue;
      }

      byCampaign.set(campaign.id, {
        campaignId: campaign.id,
        sarvamCampaignId: campaign.sarvamCampaignId,
        organizationId: apiKey.organizationId,
        workspaceId: apiKey.workspaceId,
        encryptedApiKey: apiKey.apiKeyEncrypted,
      });
    }

    return { targets: [...byCampaign.values()], unresolvable };
  }

  private async cancelSarvamCampaigns(
    tenantId: string,
    targets: SarvamCancelTarget[],
  ): Promise<ProviderStopResult[]> {
    const results: ProviderStopResult[] = [];

    for (const target of targets) {
      try {
        const apiKey = this.deps.sarvamEncryptionService.decrypt(
          target.encryptedApiKey,
        );
        await this.deps.sarvamCampaignClient.updateStatus(
          target.organizationId,
          target.workspaceId,
          target.sarvamCampaignId,
          apiKey,
          "cancel",
        );
        results.push({
          target: { provider: "SARVAM", kind: "CAMPAIGN", targetId: target.campaignId },
          success: true,
          error: null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.deps.logger.warn("Sarvam campaign cancel failed during credit enforcement", {
          action: "wallet.enforcement.sarvam_cancel_failed",
          tenantId,
          campaignId: target.campaignId,
          sarvamCampaignId: target.sarvamCampaignId,
          error: message,
        });
        results.push({
          target: { provider: "SARVAM", kind: "CAMPAIGN", targetId: target.campaignId },
          success: false,
          error: message,
        });
      }
    }

    return results;
  }
}
