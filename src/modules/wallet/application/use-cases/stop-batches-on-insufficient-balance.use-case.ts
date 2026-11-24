import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { IBolnaClientFactory } from "../../../../shared/config/external/bolna/bolna-client.factory";
import { evaluateCreditLimit } from "../../domain/rules/credit-limit.rules";
import prisma from "../../../../shared/config/database/prisma";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { decideCampaignStatusFromBatches } from "../../../campaigns/domain/rules/campaign-lifecycle.rules";
import { activeCampaignGuard } from "../../../campaigns/infrastructure/queries/campaign-lifecycle-guard";

export class StopBatchesOnInsufficientBalanceUseCase {
  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly planRepo: PlanRepository,
    private readonly bolnaClientFactory: IBolnaClientFactory,
    private readonly logger: Logger,
  ) {}

  async execute(input: { tenantId: string }): Promise<void> {
    const wallet = await this.walletRepo.findByTenantId(input.tenantId);
    if (!wallet) return;

    const plan = await this.planRepo.getActivePlanForTenant(input.tenantId);
    if (!plan || plan.status !== "ACTIVE") return;

    const inFlightCallCount = await prisma.call.count({
      where: {
        tenantId: input.tenantId,
        status: "CALLING",
      },
    });

    const evaluation = evaluateCreditLimit({
      wallet: {
        cashBalance: wallet.cashBalance,
        bonusBalance: wallet.bonusBalance,
        bonusExpiresAt: wallet.bonusExpiresAt,
      },
      creditLimitPaisa: plan.creditLimit,
      perMinuteRatePaisa: plan.perMinuteRate,
      inFlightCallCount,
    });

    if (!evaluation.shouldStop) return;

    const runningBatches = await prisma.leadBatch.findMany({
      where: {
        tenantId: input.tenantId,
        status: { in: ["RUNNING", "SCHEDULED"] },
      },
    });

    if (runningBatches.length === 0) return;

    this.logger.warn("Stopping batches — credit limit reached", {
      action: "wallet.stop_batches",
      tenantId: input.tenantId,
      batchCount: runningBatches.length,
    });

    let bolnaClient: any = null;
    if (runningBatches.some((b) => Boolean(b.bolnaBatchId))) {
      try {
        bolnaClient = await this.bolnaClientFactory.forTenant(input.tenantId);
      } catch (bolnaFactoryErr) {
        this.logger.warn("Could not instantiate Bolna client during batch stop", {
          error: bolnaFactoryErr,
          tenantId: input.tenantId,
        });
      }
    }

    for (const batch of runningBatches) {
      if (batch.bolnaBatchId && bolnaClient) {
        try {
          await bolnaClient.batches.stop(batch.bolnaBatchId);
        } catch (bolnaErr) {
          this.logger.warn("Bolna batch stop failed or already stopped", {
            error: bolnaErr,
            batchId: batch.id,
            bolnaBatchId: batch.bolnaBatchId,
          });
        }
      }

      try {
        await prisma.$transaction(async (tx) => {
          // Update batch status
          await tx.leadBatch.update({
            where: { id: batch.id },
            data: { status: "STOPPED" },
          });

          // Find active/scheduled calls in this batch
          const activeCalls = await tx.call.findMany({
            where: {
              batchId: batch.id,
              status: { in: ["SCHEDULED", "CALLING", "PENDING"] },
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

          // Mark uncalled and scheduled retry leads as STOPPED
          await tx.lead.updateMany({
            where: {
              batchId: batch.id,
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
      } catch (err) {
        this.logger.error("Failed to stop batch locally on credit limit", err, {
          action: "wallet.stop_batches.batch_failed",
          tenantId: input.tenantId,
          batchId: batch.id,
        });
      }
    }

    // 7. Reconcile campaign status with the shared batch-based rule. The
    // atomic guard preserves a campaign already finalized by another path.
    const campaignIds = [...new Set(runningBatches.map((b) => b.campaignId))];

    for (const campaignId of campaignIds) {
      const batchRows = await prisma.leadBatch.findMany({
        where: { campaignId, isDeleted: false },
        select: { status: true },
      });
      const decision = decideCampaignStatusFromBatches(
        batchRows.map((b) => b.status),
      );

      if (decision.action === "settle") {
        await prisma.campaign.updateMany({
          where: {
            id: campaignId,
            ...activeCampaignGuard(new Date(), {
              allowLowBalanceMarked: true,
            }),
          },
          data: { status: decision.status, completedAt: new Date() },
        });
      }
    }
  }
}
