import prisma from "../../../../shared/config/database/prisma";
import type { Prisma, CallStatus, CallSource } from "@prisma/client";
import type { ExportCallsQueryDTO } from "../dto/call-center.dto";

export class ExportCallCenterCsvUseCase {
  async execute(tenantId: string, query: ExportCallsQueryDTO): Promise<string> {
    const where: Prisma.CallWhereInput = {
      tenantId,
      isDeleted: false,
    };

    if (query.source) {
      where.source = query.source as CallSource;
    }

    if (query.status) {
      const statuses = query.status
        .split(",")
        .map((s) => s.trim() as CallStatus)
        .filter(Boolean);
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
    }

    if (query.dateFrom || query.dateTo) {
      where.startedAt = {
        ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
        ...(query.dateTo && { lte: new Date(query.dateTo) }),
      };
    }

    if (query.search) {
      where.OR = [
        { lead: { name: { contains: query.search, mode: "insensitive" } } },
        { lead: { phone: { contains: query.search } } },
        { quickDialJob: { recipientPhone: { contains: query.search } } },
        { inboundNumber: { phoneNumber: { contains: query.search } } },
      ];
    }

    const calls = await prisma.call.findMany({
      where,
      take: 5000,
      orderBy: { startedAt: "desc" },
      include: {
        lead: { select: { name: true, phone: true } },
        campaign: { select: { name: true } },
        assistant: { select: { name: true } },
        quickDialJob: { select: { recipientPhone: true } },
        inboundNumber: { select: { phoneNumber: true } },
      },
    });

    const escapeCsv = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      "Call ID",
      "Date",
      "Time",
      "Source",
      "Status",
      "Contact Phone",
      "Contact Name",
      "Assistant",
      "Campaign",
      "Inbound Line",
      "Duration (s)",
      "Billed Cost (INR)",
      "Provider Call ID",
      "Recording URL",
    ];

    const rows: string[] = [headers.join(",")];

    for (const call of calls) {
      const started = call.startedAt ? new Date(call.startedAt) : null;
      const dateStr = started ? started.toISOString().split("T")[0] : "";
      const timeStr = started
        ? started.toISOString().split("T")[1].slice(0, 8)
        : "";

      const contactPhone =
        call.lead?.phone ||
        call.quickDialJob?.recipientPhone ||
        "";

      const contactName = call.lead?.name || "";
      const assistantName = call.assistant?.name || "";
      const campaignName = call.campaign?.name || "";
      const inboundLine = call.inboundNumber?.phoneNumber || "";

      const costInr =
        call.chargedAmount != null
          ? (call.chargedAmount / 100).toFixed(2)
          : call.cost != null
            ? (call.cost / 100).toFixed(2)
            : "0.00";

      const row = [
        escapeCsv(call.id),
        escapeCsv(dateStr),
        escapeCsv(timeStr),
        escapeCsv(call.source),
        escapeCsv(call.status),
        escapeCsv(contactPhone),
        escapeCsv(contactName),
        escapeCsv(assistantName),
        escapeCsv(campaignName),
        escapeCsv(inboundLine),
        escapeCsv(call.duration ?? 0),
        escapeCsv(costInr),
        escapeCsv(call.bolnaCallId),
        escapeCsv(call.recording),
      ];

      rows.push(row.join(","));
    }

    return rows.join("\r\n");
  }
}
