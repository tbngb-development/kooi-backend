import type { WalletIncidentState } from "@prisma/client";

export interface ClaimIncidentInput {
  tenantId: string;
  triggerBalancePaisa: number;
}

export interface ClaimWarningInput {
  tenantId: string;
  balancePaisa: number;
}

/**
 * U-03/U-04: durable, singleton incident state. All methods are safe under
 * concurrent webhooks, retries and multiple app instances.
 */
export interface WalletIncidentStateRepository {
  /**
   * Atomically claim the single incident for a tenant.
   * - Winner of the unique-key insert creates the row.
   * - Losers receive the same row.
   * - A RESOLVED singleton is reopened in place; a second row is never created.
   */
  claim(input: ClaimIncidentInput): Promise<WalletIncidentState>;

  /**
   * Atomically claim the positive-balance warning for the current low-balance
   * crossing. Returns the stable crossing timestamp: the winner's `now`, or the
   * existing timestamp when a concurrent debit/retry already owns the crossing.
   * Callers build all idempotency keys from this value so duplicates converge.
   * Never mutates campaigns/batches or enforcement state.
   */
  claimWarning(input: ClaimWarningInput, now?: Date): Promise<Date>;

  /**
   * Re-arm the warning once the balance recovers above the threshold. Clearing
   * `warningSentAt` is the only thing that permits a future crossing to warn
   * again; enforcement claim/resolve never touches warning state.
   */
  clearWarning(tenantId: string): Promise<void>;

  /** Idempotently mark the incident resolved. Never mutates campaigns/batches. */
  resolve(incidentId: string): Promise<WalletIncidentState>;

  /**
   * U-04: atomically take the enforcement lease. Only succeeds while the
   * incident is OPEN and the lease is free or older than `leaseMs`.
   */
  beginEnforcement(
    incidentId: string,
    now: Date,
    leaseMs: number,
  ): Promise<boolean>;

  /** Persist honest per-target provider outcomes and clear the lease. */
  markBlocked(
    incidentId: string,
    providerActions: unknown[],
  ): Promise<WalletIncidentState>;

  /**
   * U-05: persist honest provider outcomes for a failed enforcement attempt and
   * clear the lease while keeping the incident OPEN so the reconciler retries.
   * Local execution remains blocked by the balance gate and any DB stops the
   * adapter already applied; this never records provider success.
   */
  recordEnforcementFailure(
    incidentId: string,
    providerActions: unknown[],
  ): Promise<WalletIncidentState>;

  /** OPEN incidents with no lease, or a lease older than `leaseMs`. */
  findStale(
    limit: number,
    leaseMs: number,
    now?: Date,
  ): Promise<WalletIncidentState[]>;
}
