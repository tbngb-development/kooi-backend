import type { Logger } from "../../../../shared/logging/logger.interface";
import type { WalletIncidentStateRepository } from "../interfaces/wallet-incident-state-repository.interface";
import type { CreditEnforcementOrchestrator } from "../use-cases/credit-enforcement-orchestrator";

const DEFAULT_POLL_MS = 30_000;
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_LEASE_MS = 60_000;

export interface CreditEnforcementReconcilerDeps {
  incidents: WalletIncidentStateRepository;
  orchestrator: Pick<CreditEnforcementOrchestrator, "enforce">;
  logger: Logger;
  enabled: boolean;
  pollMs: number;
  batchSize: number;
  leaseMs: number;
}

/**
 * Crash recovery. Any OPEN incident whose enforcement lease is missing or
 * expired is re-driven through the single orchestrator path, and BLOCKED
 * incidents are re-checked so a recharge closes them without waiting for a
 * new call webhook.
 */
export class CreditEnforcementReconciler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight = false;

  constructor(private readonly deps: CreditEnforcementReconcilerDeps) {}

  start(): void {
    const pollMs = this.deps.pollMs || DEFAULT_POLL_MS;
    if (!this.deps.enabled || this.timer) return;
    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        this.deps.logger.error(
          "Credit enforcement reconciler tick failed",
          error,
          { action: "wallet.enforcement.reconcile_tick_failed" },
        );
      });
    }, pollMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async tick(now: Date = new Date()): Promise<number> {
    if (!this.deps.enabled || this.inFlight) return 0;
    this.inFlight = true;

    try {
      const batchSize = this.deps.batchSize || DEFAULT_BATCH_SIZE;
      const leaseMs = this.deps.leaseMs || DEFAULT_LEASE_MS;
      const stale = await this.deps.incidents.findStale(batchSize, leaseMs, now);
      // Share one bounded budget with the stale-OPEN sweep. A BLOCKED row is
      // cheap to re-check and only resolves when the wallet has funds again.
      const blocked = stale.length < batchSize
        ? await this.deps.incidents.findBlocked(batchSize - stale.length)
        : [];
      const seenTenants = new Set<string>();
      const due = [...stale, ...blocked].filter((incident) => {
        if (seenTenants.has(incident.tenantId)) return false;
        seenTenants.add(incident.tenantId);
        return true;
      });

      for (const incident of due) {
        try {
          await this.deps.orchestrator.enforce({
            tenantId: incident.tenantId,
            reason: "reconciler",
          });
        } catch (error) {
          this.deps.logger.error(
            "Credit enforcement reconcile failed",
            error,
            {
              action: "wallet.enforcement.reconcile_failed",
              tenantId: incident.tenantId,
              incidentId: incident.id,
            },
          );
        }
      }

      return due.length;
    } finally {
      this.inFlight = false;
    }
  }
}
