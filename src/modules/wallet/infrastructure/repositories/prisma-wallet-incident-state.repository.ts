import prisma from "../../../../shared/config/database/prisma";
import type { WalletIncidentState } from "@prisma/client";
import type {
  WalletIncidentStateRepository,
  ClaimIncidentInput,
  ClaimWarningInput,
} from "../../application/interfaces/wallet-incident-state-repository.interface";

/**
 * U-03/U-04: singleton incident per tenant, guarded by a derived unique key.
 * `tenantId` is also unique in the schema so no second row can ever be made.
 */
export class PrismaWalletIncidentStateRepository
  implements WalletIncidentStateRepository
{
  async claim(input: ClaimIncidentInput): Promise<WalletIncidentState> {
    const idempotencyKey = `wallet-incident:${input.tenantId}`;
    const now = new Date();

    try {
      return await prisma.walletIncidentState.create({
        data: {
          tenantId: input.tenantId,
          idempotencyKey,
          state: "OPEN",
          triggerBalancePaisa: input.triggerBalancePaisa,
          detectedAt: now,
        },
      });
    } catch (err: unknown) {
      if ((err as { code?: string }).code !== "P2002") throw err;

      // Another webhook/instance won the insert. Return that singleton.
      const existing = await prisma.walletIncidentState.findUnique({
        where: { idempotencyKey },
      });

      if (!existing) {
        // Defensive: unique violation but row not visible yet; retry once.
        return this.claim(input);
      }

      if (existing.state !== "RESOLVED") {
        return existing;
      }

      // Reopen the resolved singleton in place. The state='RESOLVED' predicate
      // makes concurrent reopens idempotent: exactly one caller wins.
      // Warning state is intentionally left untouched: re-arming belongs to
      // clearWarning when the balance actually recovers above the threshold.
      // Clearing it here would re-notify on every later positive-balance debit.
      await prisma.walletIncidentState.updateMany({
        where: { id: existing.id, state: "RESOLVED" },
        data: {
          state: "OPEN",
          triggerBalancePaisa: input.triggerBalancePaisa,
          detectedAt: now,
          resolvedAt: null,
          enforcementSentAt: null,
          enforcementStartedAt: null,
          providerActions: [],
        },
      });

      const reopened = await prisma.walletIncidentState.findUnique({
        where: { id: existing.id },
      });
      if (!reopened) {
        throw new Error(
          `Wallet incident ${existing.id} disappeared while reopening`,
        );
      }
      return reopened;
    }
  }

  /**
   * Claim the positive-balance warning for the current crossing. The unique
   * tenant key keeps a single row even under concurrent inserts; the conditional
   * update sets warningSentAt only once per crossing. The returned timestamp is
   * stable for the whole crossing so every caller derives the same idempotency
   * keys, making duplicate webhooks and retries replay-safe.
   */
  async claimWarning(
    input: ClaimWarningInput,
    now: Date = new Date(),
  ): Promise<Date> {
    const idempotencyKey = `wallet-incident:${input.tenantId}`;

    try {
      await prisma.walletIncidentState.create({
        data: {
          tenantId: input.tenantId,
          idempotencyKey,
          state: "OPEN",
          triggerBalancePaisa: input.balancePaisa,
          detectedAt: now,
          warningSentAt: now,
        },
      });
      return now;
    } catch (err: unknown) {
      if ((err as { code?: string }).code !== "P2002") throw err;
    }

    // Row already exists: atomically take the crossing if none is claimed yet.
    const claimed = await prisma.walletIncidentState.updateMany({
      where: { tenantId: input.tenantId, warningSentAt: null },
      data: { warningSentAt: now },
    });
    if (claimed.count === 1) return now;

    // Another debit/instance owns this crossing. Reuse its timestamp so all
    // callers converge on the same email/event idempotency key.
    const existing = await prisma.walletIncidentState.findUnique({
      where: { tenantId: input.tenantId },
      select: { warningSentAt: true },
    });
    return existing?.warningSentAt ?? now;
  }

  /** Re-arm warnings when the balance recovers above the threshold. */
  async clearWarning(tenantId: string): Promise<void> {
    await prisma.walletIncidentState.updateMany({
      where: { tenantId, warningSentAt: { not: null } },
      data: { warningSentAt: null },
    });
  }

  async resolve(
    incidentId: string,
    leaseToken?: Date,
  ): Promise<WalletIncidentState> {
    await prisma.walletIncidentState.updateMany({
      where: {
        id: incidentId,
        state: { not: "RESOLVED" },
        // A lease holder must not resolve an incident that another instance has
        // already taken over. Recharge-driven resolution carries no lease.
        ...(leaseToken ? { enforcementStartedAt: leaseToken } : {}),
      },
      data: {
        state: "RESOLVED",
        resolvedAt: new Date(),
        enforcementStartedAt: null,
      },
    });

    const resolved = await prisma.walletIncidentState.findUnique({
      where: { id: incidentId },
    });
    if (!resolved) {
      throw new Error(`Wallet incident ${incidentId} not found`);
    }
    return resolved;
  }

  /** U-04: atomic lease — only one caller can transition OPEN → in-progress. */
  async beginEnforcement(
    incidentId: string,
    now: Date,
    leaseMs: number,
  ): Promise<boolean> {
    const result = await prisma.walletIncidentState.updateMany({
      where: {
        id: incidentId,
        state: "OPEN",
        OR: [
          { enforcementStartedAt: null },
          { enforcementStartedAt: { lt: new Date(now.getTime() - leaseMs) } },
        ],
      },
      data: { enforcementStartedAt: now },
    });
    return result.count === 1;
  }

  /**
   * U-04: persist honest per-target outcomes and release the lease. When a
   * lease token is supplied, the write is conditional on still owning that
   * lease; a late write from a superseded instance is a no-op.
   */
  async markBlocked(
    incidentId: string,
    providerActions: unknown[],
    leaseToken?: Date,
  ): Promise<WalletIncidentState> {
    if (!leaseToken) {
      return prisma.walletIncidentState.update({
        where: { id: incidentId },
        data: {
          state: "BLOCKED",
          enforcementStartedAt: null,
          providerActions: providerActions as never,
        },
      });
    }

    await prisma.walletIncidentState.updateMany({
      where: {
        id: incidentId,
        state: "OPEN",
        enforcementStartedAt: leaseToken,
      },
      data: {
        state: "BLOCKED",
        enforcementStartedAt: null,
        providerActions: providerActions as never,
      },
    });
    return this.getById(incidentId);
  }

  /** U-05: keep OPEN and clear lease so stale reconciliation retries after failure. */
  async recordEnforcementFailure(
    incidentId: string,
    providerActions: unknown[],
    leaseToken?: Date,
  ): Promise<WalletIncidentState> {
    if (!leaseToken) {
      return prisma.walletIncidentState.update({
        where: { id: incidentId },
        data: {
          state: "OPEN",
          enforcementStartedAt: null,
          providerActions: providerActions as never,
        },
      });
    }

    await prisma.walletIncidentState.updateMany({
      where: {
        id: incidentId,
        state: "OPEN",
        enforcementStartedAt: leaseToken,
      },
      data: {
        state: "OPEN",
        enforcementStartedAt: null,
        providerActions: providerActions as never,
      },
    });
    return this.getById(incidentId);
  }

  private async getById(incidentId: string): Promise<WalletIncidentState> {
    const current = await prisma.walletIncidentState.findUnique({
      where: { id: incidentId },
    });
    if (!current) {
      throw new Error(`Wallet incident ${incidentId} not found`);
    }
    return current;
  }

  /** BLOCKED incidents to re-check for a recharge on every reconcile tick. */
  async findBlocked(limit: number): Promise<WalletIncidentState[]> {
    return prisma.walletIncidentState.findMany({
      where: { state: "BLOCKED" },
      orderBy: { detectedAt: "asc" },
      take: limit,
    });
  }

  /** U-04: OPEN incidents whose enforcement lease is missing or expired. */
  async findStale(
    limit: number,
    leaseMs: number,
    now: Date = new Date(),
  ): Promise<WalletIncidentState[]> {
    return prisma.walletIncidentState.findMany({
      where: {
        state: "OPEN",
        OR: [
          { enforcementStartedAt: null },
          { enforcementStartedAt: { lt: new Date(now.getTime() - leaseMs) } },
        ],
      },
      orderBy: { detectedAt: "asc" },
      take: limit,
    });
  }
}
