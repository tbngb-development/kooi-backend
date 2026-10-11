import prisma from "../../../../shared/config/database/prisma";
import type { NumberRosterItemDTO } from "../dto/call-center.dto";

export class GetNumberRosterUseCase {
  async execute(tenantId: string): Promise<NumberRosterItemDTO[]> {
    const numbers = await prisma.inboundNumber.findMany({
      where: {
        tenantId,
        status: { in: ["ACTIVE", "SUSPENDED", "AVAILABLE"] },
      },
      include: {
        assistant: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (numbers.length === 0) {
      return [];
    }

    const numberIds = numbers.map((n) => n.id);

    // Aggregate call stats per inboundNumberId
    const callAggs = await prisma.call.groupBy({
      by: ["inboundNumberId"],
      where: {
        tenantId,
        inboundNumberId: { in: numberIds },
        isDeleted: false,
      },
      _count: { id: true },
      _sum: { duration: true, chargedAmount: true },
      _max: { startedAt: true },
    });

    const aggMap = new Map<
      string,
      {
        totalCalls: number;
        durationSec: number;
        costPaisa: number;
        lastCallAt: Date | null;
      }
    >();

    for (const agg of callAggs) {
      if (agg.inboundNumberId) {
        aggMap.set(agg.inboundNumberId, {
          totalCalls: agg._count.id,
          durationSec: agg._sum.duration ?? 0,
          costPaisa: agg._sum.chargedAmount ?? 0,
          lastCallAt: agg._max.startedAt ?? null,
        });
      }
    }

    return numbers.map((num) => {
      const stats = aggMap.get(num.id) ?? {
        totalCalls: 0,
        durationSec: 0,
        costPaisa: 0,
        lastCallAt: null,
      };

      return {
        id: num.id,
        phoneNumber: num.phoneNumber,
        provider: num.provider,
        status: num.status,
        syncStatus: num.providerSyncStatus,
        assignedAssistant: num.assistant,
        totalCalls: stats.totalCalls,
        totalMinutes: Math.round((stats.durationSec / 60) * 10) / 10,
        totalCostPaisa: stats.costPaisa,
        lastCallAt: stats.lastCallAt,
        monthlyRentalPaisa: num.monthlyRentalPaisa,
        renewalDate: num.nextBillingAt,
      };
    });

  }
}
