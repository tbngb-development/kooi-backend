import prisma from "../../../../shared/config/database/prisma";
import type { CallCenterKPIsDTO, SourceMetricDTO } from "../dto/call-center.dto";

export class GetCallCenterKPIsUseCase {
  async execute(tenantId: string): Promise<CallCenterKPIsDTO> {
    const where = { tenantId, isDeleted: false };

    // 1. Fetch aggregate metrics
    const [
      totalCalls,
      completedCalls,
      failedCalls,
      durationAgg,
      costAgg,
      sourceGroups,
      statusGroups,
    ] = await Promise.all([
      prisma.call.count({ where }),
      prisma.call.count({ where: { ...where, status: "COMPLETED" } }),
      prisma.call.count({
        where: { ...where, status: { in: ["FAILED", "STOPPED"] } },
      }),

      prisma.call.aggregate({
        where: { ...where, duration: { not: null } },
        _sum: { duration: true },
        _avg: { duration: true },
      }),
      prisma.call.aggregate({
        where: { ...where, chargedAmount: { not: null } },
        _sum: { chargedAmount: true },
      }),
      prisma.call.groupBy({
        by: ["source"],
        where,
        _count: { id: true },
        _sum: { duration: true, chargedAmount: true },
      }),
      prisma.call.groupBy({
        by: ["status"],
        where,
        _count: { id: true },
      }),
    ]);

    // Source breakdown map
    const emptyMetric = (): SourceMetricDTO => ({
      totalCalls: 0,
      completedCalls: 0,
      durationSec: 0,
      costPaisa: 0,
    });

    const sourceBreakdown = {
      campaign: emptyMetric(),
      inbound: emptyMetric(),
      quickDial: emptyMetric(),
    };

    for (const group of sourceGroups) {
      const metric: SourceMetricDTO = {
        totalCalls: group._count.id,
        completedCalls: 0, // will be augmented
        durationSec: group._sum.duration ?? 0,
        costPaisa: group._sum.chargedAmount ?? 0,
      };

      if (group.source === "CAMPAIGN") {
        sourceBreakdown.campaign = metric;
      } else if (group.source === "INBOUND") {
        sourceBreakdown.inbound = metric;
      } else if (group.source === "QUICK_DIAL") {
        sourceBreakdown.quickDial = metric;
      }
    }

    // Status breakdown map
    const statusBreakdown: Record<string, number> = {};
    for (const group of statusGroups) {
      statusBreakdown[group.status] = group._count.id;
    }

    const answerRate =
      totalCalls > 0
        ? Math.round((completedCalls / totalCalls) * 100 * 10) / 10
        : 0;

    const totalDurationSec = durationAgg._sum.duration ?? 0;
    const avgDurationSec = Math.round(durationAgg._avg.duration ?? 0);
    const totalCostPaisa = costAgg._sum.chargedAmount ?? 0;

    return {
      totalCalls,
      completedCalls,
      failedCalls,
      totalDurationSec,
      avgDurationSec,
      totalCostPaisa,
      answerRate,
      sourceBreakdown,
      statusBreakdown,
    };
  }
}
