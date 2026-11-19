import type { WalletIncidentState } from "@prisma/client";

export interface ClaimIncidentInput {
  tenantId: string;
  triggerBalancePaisa: number;
}

/**
 * U-03: durable, singleton incident state. All methods are safe under
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
}
