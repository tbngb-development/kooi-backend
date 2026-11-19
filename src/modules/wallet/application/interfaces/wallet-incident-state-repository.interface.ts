import type { WalletIncidentState } from "@prisma/client";

export interface ClaimIncidentInput {
  tenantId: string;
  triggerBalancePaisa: number;
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

  /** OPEN incidents with no lease, or a lease older than `leaseMs`. */
  findStale(
    limit: number,
    leaseMs: number,
    now?: Date,
  ): Promise<WalletIncidentState[]>;
}
