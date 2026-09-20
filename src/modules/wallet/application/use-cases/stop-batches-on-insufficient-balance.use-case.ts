import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { IBolnaClientFactory } from "../../../../shared/config/external/bolna/bolna-client.factory";
import { evaluateCreditLimit } from "../../domain/rules/credit-limit.rules";
import prisma from "../../../../shared/config/database/prisma";

export class StopBatchesOnInsufficientBalanceUseCase {
  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly planRepo: PlanRepository,
    private readonly bolnaClientFactory: IBolnaClientFactory,
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
      creditLimitPaisa: plan.lowBalanceThreshold,
      perMinuteRatePaisa: plan.perMinuteRate,
      inFlightCallCount,
    });

    if (!evaluation.shouldStop) return;

    const runningBatches = await prisma.leadBatch.findMany({
      where: {
        tenantId: input.tenantId,
        status: "RUNNING",
        bolnaBatchId: { not: null },
      },
    });

    if (runningBatches.length === 0) return;

    console.log(
      `[CreditLimit] Stopping ${runningBatches.length} batches for tenant ${input.tenantId}.`,
    );

    const bolnaClient = await this.bolnaClientFactory.forTenant(input.tenantId);

    for (const batch of runningBatches) {
      try {
        if (batch.bolnaBatchId) {
          await bolnaClient.batches.stop(batch.bolnaBatchId);
        }

        await prisma.leadBatch.update({
          where: { id: batch.id },
          data: { status: "STOPPED" },
        });

        // Mark remaining uncalled leads as STOPPED
        await prisma.lead.updateMany({
          where: { batchId: batch.id, status: "PENDING" },
          data: { status: "STOPPED", stoppedReason: "LOW_BALANCE" },
        });
      } catch (err) {
        console.error(`[CreditLimit] Failed to stop batch ${batch.id}:`, err);
      }
    }

    // 7. Update campaign status if all batches are terminal
    const campaignIds = [...new Set(runningBatches.map((b) => b.campaignId))];

    for (const campaignId of campaignIds) {
      const statuses = await prisma.leadBatch.findMany({
        where: { campaignId },
        select: { status: true },
      });

      const allTerminal = statuses.every(
        (s) =>
          s.status === "COMPLETED" ||
          s.status === "STOPPED" ||
          s.status === "FAILED",
      );

      if (allTerminal) {
        const allFailed = statuses.every((s) => s.status === "FAILED");
        await prisma.campaign.update({
          where: { id: campaignId },
          data: {
            status: allFailed ? "FAILED" : "COMPLETED",
            completedAt: new Date(),
          },
        });
      }
    }
  }
}
