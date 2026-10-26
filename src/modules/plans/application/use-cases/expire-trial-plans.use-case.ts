import prisma from "../../../../shared/config/database/prisma";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class ExpireTrialPlansUseCase {
  constructor(private readonly logger?: Logger) {}

  async execute(): Promise<number> {
    const now = new Date();
    const expiredPlans = await prisma.tenantPlan.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: { lte: now },
      },
      select: {
        id: true,
        tenantId: true,
        planVersionId: true,
        expiresAt: true,
      },
    });

    if (expiredPlans.length === 0) return 0;

    let expiredCount = 0;
    for (const tp of expiredPlans) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.tenantPlan.update({
            where: { id: tp.id },
            data: { status: "EXPIRED" },
          });
          await tx.tenantPlanEvent.create({
            data: {
              tenantPlanId: tp.id,
              tenantId: tp.tenantId,
              type: "EXPIRED",
              toPlanVersionId: tp.planVersionId,
              metadata: {
                reason: "Trial validity period expired",
                expiredAt: tp.expiresAt?.toISOString(),
              },
            },
          });
        });
        expiredCount++;
      } catch (err) {
        this.logger?.error("Failed to transition expired tenant plan", err, {
          action: "trial.expire.failed",
          tenantId: tp.tenantId,
          tenantPlanId: tp.id,
        });
      }
    }

    if (expiredCount > 0) {
      this.logger?.info("Expired overdue trial plans", {
        action: "trial.expire.batch",
        expiredCount,
      });
    }

    return expiredCount;
  }
}
