import type { InboundNumberRepository } from "../../interfaces/inbound-number-repository.interface";
import type { WalletRepository } from "../../../../wallet/application/interfaces/wallet-repository.interface";
import type { InboundNumberSyncScheduler } from "../../../infrastructure/jobs/inbound-number-sync.scheduler";
import type { BillInboundNumberRentalsResult } from "../../dto/inbound-number.dto";
import type { Logger } from "../../../../../shared/logging/logger.interface";

export class BillInboundNumberRentalsUseCase {
  constructor(
    private readonly repository: InboundNumberRepository,
    private readonly walletRepo: WalletRepository,
    private readonly syncScheduler: InboundNumberSyncScheduler,
    private readonly logger?: Logger,
  ) {}

  async execute(params?: { asOfDate?: Date }): Promise<BillInboundNumberRentalsResult> {
    const now = params?.asOfDate ?? new Date();
    const dueNumbers = await this.repository.findDueForRentalBilling(now);

    this.logger?.info("Executing inbound numbers recurring rental billing", {
      action: "inbound_numbers.billing.start",
      dueCount: dueNumbers.length,
      asOf: now.toISOString(),
    });

    const result: BillInboundNumberRentalsResult = {
      processed: 0,
      successful: 0,
      failed: 0,
      suspended: 0,
      details: [],
    };

    for (const num of dueNumbers) {
      if (!num.tenantId || num.monthlyRentalPaisa <= 0) continue;

      result.processed++;
      const periodStart = num.lastBilledAt ?? now;
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const idempotencyKey = `inbound_rental:${num.id}:${now.toISOString().slice(0, 10)}`;

      try {
        const tx = await this.walletRepo.debit({
          tenantId: num.tenantId,
          amount: num.monthlyRentalPaisa,
          description: `Monthly rental for inbound number ${num.phoneNumber}`,
          sourceType: "NUMBER_RENTAL",
          sourceId: num.id,
          idempotencyKey,
          createdBy: "SYSTEM",
          allowOverdraft: false,
        });

        await this.repository.createRentalHistory({
          inboundNumberId: num.id,
          tenantId: num.tenantId,
          amountPaisa: num.monthlyRentalPaisa,
          periodStart,
          periodEnd,
          status: "CHARGED",
          walletTxId: tx.id,
        });

        await this.repository.update(num.id, {
          lastBilledAt: now,
          nextBillingAt: periodEnd,
        });

        result.successful++;
        result.details.push({
          inboundNumberId: num.id,
          tenantId: num.tenantId,
          amountPaisa: num.monthlyRentalPaisa,
          status: "SUCCESS",
        });

        this.logger?.info("Inbound number rental billed successfully", {
          action: "inbound_numbers.billing.charged",
          inboundNumberId: num.id,
          tenantId: num.tenantId,
          amountPaisa: num.monthlyRentalPaisa,
        });
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : "Insufficient balance or debit error";

        result.failed++;
        result.suspended++;

        await this.repository.createRentalHistory({
          inboundNumberId: num.id,
          tenantId: num.tenantId,
          amountPaisa: num.monthlyRentalPaisa,
          periodStart,
          periodEnd,
          status: "FAILED",
        });

        // Auto-suspend number and enqueue Bolna unlink
        await this.repository.update(num.id, {
          status: "SUSPENDED",
          suspendedAt: now,
          providerSyncStatus: "PENDING_SYNC",
          providerSyncError: `Auto-suspended due to failed rental payment: ${errorMessage}`,
        });

        await this.syncScheduler.enqueue({
          inboundNumberId: num.id,
          action: "UNLINK",
        });

        result.details.push({
          inboundNumberId: num.id,
          tenantId: num.tenantId,
          amountPaisa: num.monthlyRentalPaisa,
          status: "SUSPENDED",
          error: errorMessage,
        });

        this.logger?.warn("Inbound number rental failed — number auto-suspended", {
          action: "inbound_numbers.billing.suspended",
          inboundNumberId: num.id,
          tenantId: num.tenantId,
          error: errorMessage,
        });
      }
    }

    return result;
  }
}
