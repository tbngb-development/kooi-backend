import prisma from "../../../../shared/config/database/prisma";
import type { WalletIncidentState } from "@prisma/client";
import type {
  WalletIncidentStateRepository,
  ClaimIncidentInput,
} from "../../application/interfaces/wallet-incident-state-repository.interface";

/**
 * U-03: singleton incident per tenant, guarded by a derived unique key.
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
      await prisma.walletIncidentState.updateMany({
        where: { id: existing.id, state: "RESOLVED" },
        data: {
          state: "OPEN",
          triggerBalancePaisa: input.triggerBalancePaisa,
          detectedAt: now,
          resolvedAt: null,
          warningSentAt: null,
          enforcementSentAt: null,
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

  async resolve(incidentId: string): Promise<WalletIncidentState> {
    await prisma.walletIncidentState.updateMany({
      where: { id: incidentId, state: { not: "RESOLVED" } },
      data: { state: "RESOLVED", resolvedAt: new Date() },
    });

    const resolved = await prisma.walletIncidentState.findUnique({
      where: { id: incidentId },
    });
    if (!resolved) {
      throw new Error(`Wallet incident ${incidentId} not found`);
    }
    return resolved;
  }
}
