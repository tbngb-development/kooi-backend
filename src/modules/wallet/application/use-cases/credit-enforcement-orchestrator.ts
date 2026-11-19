import { hasExecutableBalance } from "../../domain/rules/wallet-balance.policy";
import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type { WalletIncidentStateRepository } from "../interfaces/wallet-incident-state-repository.interface";
import type {
  ICampaignStopAdapter,
  ProviderStopResult,
} from "../interfaces/campaign-stop-adapter.interface";
import type { IEmailOutboxRepository } from "../../../../shared/config/external/email/outbox-repository.types";
import type { Logger } from "../../../../shared/logging/logger.interface";

const DEFAULT_LEASE_MS = 60_000;

export type EnforcementAction =
  | "BLOCKED"
  | "RESOLVED"
  | "ALREADY_BLOCKED"
  | "IN_PROGRESS"
  | "RETRY_QUEUED";

export interface CreditEnforcementResult {
  action: EnforcementAction;
  incidentId?: string;
}

export interface CreditEnforcementOrchestratorDeps {
  incidents: WalletIncidentStateRepository;
  wallets: WalletRepository;
  providers: ICampaignStopAdapter;
  emailOutbox: IEmailOutboxRepository;
  tenantEmail: (tenantId: string) => Promise<string | null>;
  logger: Logger;
  /** Enforcement lease window in ms. Defaults to 60s. */
  leaseMs?: number;
}

/**
 * U-04: the single awaited enforcement path. Claim → gate → stop providers →
 * persist honest results → enqueue email → mark BLOCKED. A crash leaves the
 * incident OPEN with a stale/missing lease for the reconciler to reclaim.
 */
export class CreditEnforcementOrchestrator {
  private readonly leaseMs: number;

  constructor(private readonly deps: CreditEnforcementOrchestratorDeps) {
    this.leaseMs = deps.leaseMs ?? DEFAULT_LEASE_MS;
  }

  async enforce(input: {
    tenantId: string;
    reason?: string;
  }): Promise<CreditEnforcementResult> {
    const now = new Date();
    const wallet = await this.deps.wallets.findByTenantId(input.tenantId);
    const executable = wallet ? hasExecutableBalance(wallet, now) : false;
    const triggerBalancePaisa = wallet
      ? wallet.cashBalance + wallet.bonusBalance
      : 0;

    const incident = await this.deps.incidents.claim({
      tenantId: input.tenantId,
      triggerBalancePaisa,
    });

    if (incident.state === "BLOCKED") {
      return { action: "ALREADY_BLOCKED", incidentId: incident.id };
    }

    const leased = await this.deps.incidents.beginEnforcement(
      incident.id,
      now,
      this.leaseMs,
    );
    if (!leased) {
      return { action: "IN_PROGRESS", incidentId: incident.id };
    }

    // Re-evaluate under the lease: balance may have recovered between claim
    // and lease acquisition (e.g. recharge). Resolve instead of stopping.
    if (executable) {
      await this.deps.incidents.resolve(incident.id);
      return { action: "RESOLVED", incidentId: incident.id };
    }

    let providerActions: ProviderStopResult[];
    try {
      providerActions = await this.deps.providers.stop(input.tenantId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.deps.logger.error(
        "Credit enforcement provider adapter failed",
        err,
        {
          action: "wallet.enforcement.provider_adapter_failed",
          tenantId: input.tenantId,
          incidentId: incident.id,
          reason: input.reason,
        },
      );
      providerActions = [
        {
          target: { provider: "ADAPTER", kind: "STOP", targetId: "ALL" },
          success: false,
          error: message,
        },
      ];
    }

    const hasProviderFailure = providerActions.some((r) => !r.success);

    // Email must never block enforcement. U-07 will refine copy/admin copy.
    // Idempotency key makes duplicate enqueue on retry safe.
    try {
      const to = await this.deps.tenantEmail(input.tenantId);
      if (to) {
        await this.deps.emailOutbox.enqueue({
          idempotencyKey: `enforce:${incident.id}`,
          to,
          subject: "KOOI — wallet blocked",
          html:
            "<p>Your KOOI workspace has been blocked because the available wallet balance reached zero. Recharge to resume.</p>",
        });
      }
    } catch (err) {
      this.deps.logger.error(
        "Credit enforcement email enqueue failed",
        err,
        {
          action: "wallet.enforcement.email_enqueue_failed",
          tenantId: input.tenantId,
          incidentId: incident.id,
        },
      );
    }

    if (hasProviderFailure) {
      await this.deps.incidents.recordEnforcementFailure(
        incident.id,
        providerActions,
      );

      this.deps.logger.warn("Wallet enforcement recorded failure and queued retry", {
        action: "wallet.enforcement.retry_queued",
        tenantId: input.tenantId,
        incidentId: incident.id,
        reason: input.reason,
        providerFailures: providerActions.filter((r) => !r.success).length,
      });

      return { action: "RETRY_QUEUED", incidentId: incident.id };
    }

    await this.deps.incidents.markBlocked(incident.id, providerActions);

    this.deps.logger.warn("Wallet incident enforced and blocked", {
      action: "wallet.enforcement.blocked",
      tenantId: input.tenantId,
      incidentId: incident.id,
      reason: input.reason,
      providerFailures: 0,
    });

    return { action: "BLOCKED", incidentId: incident.id };
  }
}
