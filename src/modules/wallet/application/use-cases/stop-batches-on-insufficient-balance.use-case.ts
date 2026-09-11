import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { IBolnaClientFactory } from "../../../../shared/config/external/bolna/bolna-client.factory";
import { getEffectiveAvailableBalance } from "../../domain/rules/bonus-first-deduction.rules";
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

    const availableBalance = getEffectiveAvailableBalance(wallet);

    // If tenant has zero or negative effective balance, stop running batches
    if (availableBalance <= 0) {
      const runningBatches = await prisma.leadBatch.findMany({
        where: {
          tenantId: input.tenantId,
          status: "RUNNING",
          bolnaBatchId: { not: null },
        },
      });

      if (runningBatches.length === 0) return;

      const bolnaClient = await this.bolnaClientFactory.forTenant(
        input.tenantId,
      );

      for (const batch of runningBatches) {
        try {
          if (batch.bolnaBatchId) {
            await bolnaClient.batches.stop(batch.bolnaBatchId);
          }
          await prisma.leadBatch.update({
            where: { id: batch.id },
            data: { status: "STOPPED" },
          });
        } catch (err) {
          console.error(`[Wallet] Failed to stop batch ${batch.id}:`, err);
        }
      }
    }
  }
}
