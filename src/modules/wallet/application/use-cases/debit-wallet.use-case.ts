import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import { calculateCallCost } from "../../../plans/domain/rules/billing-calculator";
import {
  TenantPlanNotFoundError,
  PlanNotActiveError,
} from "../../../plans/domain/errors/plan.errors";
import type { StopBatchesOnInsufficientBalanceUseCase } from "./stop-batches-on-insufficient-balance.use-case";
import type { CheckLowBalanceUseCase } from "./check-low-balance.use-case";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface DebitCallInput {
  tenantId: string;
  callId: string;
  bolnaCallId: string;
  durationSec: number;
}

export interface DebitCallResult {
  amountPaisa: number;
  billableSeconds: number;
  planVersionId: string;
  appliedRate: number;
  appliedMinSec: number;
  appliedIncrementSec: number;
}

export class DebitWalletForCallUseCase {
  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly planRepo: PlanRepository,
    private readonly checkLowBalance: CheckLowBalanceUseCase,
    private readonly stopBatches: StopBatchesOnInsufficientBalanceUseCase,
    private readonly logger: Logger,
  ) {}

  async execute(input: DebitCallInput): Promise<DebitCallResult | null> {
    if (input.durationSec <= 0) return null;

    // 1. Resolve Effective Terms from DB
    const activePlan = await this.planRepo.getActivePlanForTenant(
      input.tenantId,
    );
    if (!activePlan) {
      throw new TenantPlanNotFoundError(input.tenantId);
    }
    if (activePlan.status !== "ACTIVE") {
      throw new PlanNotActiveError();
    }

    // 2. Calculate Call Cost (Deterministic Integer Math)
    const { billableSeconds, costPaisa } = calculateCallCost({
      durationSec: input.durationSec,
      perMinuteRate: activePlan.perMinuteRate,
      billingMinimumSec: activePlan.billingMinimumSec,
      billingIncrementSec: activePlan.billingIncrementSec,
    });

    if (costPaisa <= 0) return null;

    // 3. Perform Idempotent, Atomic Debit (with overdraft allowed for calls)
    await this.walletRepo.debit({
      tenantId: input.tenantId,
      amount: costPaisa,
      description: `AI Call ${input.callId} (${billableSeconds}s billable @ ₹${(activePlan.perMinuteRate / 100).toFixed(2)}/min)`,
      sourceType: "CALL",
      sourceId: input.callId,
      idempotencyKey: `call:${input.callId}:${input.bolnaCallId}`,
      createdBy: "SYSTEM",
      allowOverdraft: true,
    });

    this.logger.info("Wallet debited for call", {
      action: "wallet.debit",
      tenantId: input.tenantId,
      callId: input.callId,
      amountPaisa: costPaisa,
      billableSeconds,
    });

    // 4. Threshold & Batch Invariant Checks (halt batches immediately if limit breached)
    this.checkLowBalance.execute({ tenantId: input.tenantId }).catch((err) =>
      this.logger.error("Low balance check failed", err, {
        action: "wallet.low_balance_check",
        tenantId: input.tenantId,
      }),
    );
    try {
      await this.stopBatches.execute({ tenantId: input.tenantId });
    } catch (err) {
      this.logger.error("Stop batches check failed", err, {
        action: "wallet.stop_batches_check",
        tenantId: input.tenantId,
      });
    }

    // 5. Return Full Historical Breakdown for Call Snapshot
    return {
      amountPaisa: costPaisa,
      billableSeconds,
      planVersionId: activePlan.planVersionId,
      appliedRate: activePlan.perMinuteRate,
      appliedMinSec: activePlan.billingMinimumSec,
      appliedIncrementSec: activePlan.billingIncrementSec,
    };
  }
}
