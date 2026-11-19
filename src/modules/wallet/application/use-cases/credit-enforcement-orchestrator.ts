import { hasExecutableBalance } from "../../domain/rules/wallet-balance.policy";
import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type { WalletIncidentStateRepository } from "../interfaces/wallet-incident-state-repository.interface";
import type {
  ICampaignStopAdapter,
  ProviderStopResult,
} from "../interfaces/campaign-stop-adapter.interface";
import type {
  EnqueueEmailInput,
  IEmailOutboxRepository,
} from "../../../../shared/config/external/email/outbox-repository.types";
import {
  walletBlockedAdminEmailHtml,
  walletBlockedEmailHtml,
} from "../../../../shared/config/external/email/templates/wallet-blocked.template";
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
  /** Active platform admin addresses that receive the internal enforcement copy. */
  adminEmails: () => Promise<string[]>;
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
    const triggerBalancePaisa = wallet
      ? wallet.cashBalance + wallet.bonusBalance
      : 0;

    const incident = await this.deps.incidents.claim({
      tenantId: input.tenantId,
      triggerBalancePaisa,
    });

    if (incident.state === "BLOCKED") {
      // A recharge must close the singleton incident to RESOLVED. It must never
      // resume the campaigns/batches the block stopped. Re-read the wallet at
      // decision time so a stale positive reading cannot close an incident
      // that a concurrent settlement has just exhausted again.
      const blockedWallet = await this.deps.wallets.findByTenantId(
        input.tenantId,
      );
      if (blockedWallet && hasExecutableBalance(blockedWallet)) {
        await this.deps.incidents.resolve(incident.id);
        return { action: "RESOLVED", incidentId: incident.id };
      }
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

    // Re-evaluate under the lease against the current balance: a recharge
    // between the first read and lease acquisition resolves instead of stops.
    const leasedWallet = await this.deps.wallets.findByTenantId(input.tenantId);
    if (leasedWallet && hasExecutableBalance(leasedWallet)) {
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

    await this.enqueueEnforcementEmails({
      incidentId: incident.id,
      tenantId: input.tenantId,
      reason: input.reason,
      triggerBalancePaisa,
      providerFailures: providerActions.filter((r) => !r.success).length,
    });

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

  /**
   * Enqueue the tenant notice and the internal admin copy. Enqueue is a durable
   * DB write, not a delivery — the relay owns retries/backoff/DLQ. Any failure
   * here is logged and swallowed so email can never block the block decision.
   * Keys are derived from the incident id so retries and duplicate webhooks
   * cannot create a second envelope.
   */
  private async enqueueEnforcementEmails(input: {
    incidentId: string;
    tenantId: string;
    reason?: string;
    triggerBalancePaisa: number;
    providerFailures: number;
  }): Promise<void> {
    try {
      const [tenantTo, adminEmails] = await Promise.all([
        this.deps.tenantEmail(input.tenantId),
        this.deps.adminEmails(),
      ]);

      const templateInput = {
        tenantId: input.tenantId,
        balancePaisa: input.triggerBalancePaisa,
        incidentId: input.incidentId,
        reason: input.reason,
        providerFailures: input.providerFailures,
      };

      if (tenantTo) {
        await this.enqueueSafely(
          {
            idempotencyKey: `enforce:${input.incidentId}`,
            to: tenantTo,
            subject: "KOOI — wallet balance exhausted",
            html: walletBlockedEmailHtml(templateInput),
          },
          input,
        );
      }

      const adminHtml = walletBlockedAdminEmailHtml(templateInput);
      for (const adminEmail of adminEmails) {
        if (!adminEmail) continue;
        await this.enqueueSafely(
          {
            idempotencyKey: `enforce:${input.incidentId}:admin:${adminEmail}`,
            to: adminEmail,
            subject: "KOOI — credit enforcement (internal)",
            html: adminHtml,
          },
          input,
        );
      }
    } catch (err) {
      // Recipient lookup failure (e.g. DB unavailable) must not block enforcement.
      this.deps.logger.error("Enforcement email recipient lookup failed", err, {
        action: "wallet.enforcement.email_recipient_lookup_failed",
        tenantId: input.tenantId,
        incidentId: input.incidentId,
      });
    }
  }

  private async enqueueSafely(
    envelope: EnqueueEmailInput,
    context: { tenantId: string; incidentId: string },
  ): Promise<void> {
    try {
      await this.deps.emailOutbox.enqueue(envelope);
    } catch (err) {
      this.deps.logger.error("Enforcement email enqueue failed", err, {
        action: "wallet.enforcement.email_enqueue_failed",
        tenantId: context.tenantId,
        incidentId: context.incidentId,
        idempotencyKey: envelope.idempotencyKey,
      });
    }
  }
}
