import prisma from "../../../../shared/config/database/prisma";
import { type Disposition } from "@prisma/client";
import type { DashboardRepository } from "../../application/interfaces/dashboard-repository.interface";
import type {
  DashboardOverviewOutput,
  DashboardActivityOutput,
  CampaignPerformanceOutput,
} from "../../application/dto/dashboard.dto";

const QUALIFYING_DISPOSITIONS: Disposition[] = [
  "QUALIFIED_CONSULTANT_FOLLOWUP",
  "SITE_VISIT_INTEREST",
  "INTERESTED_SEND_DETAILS",
  "INTERESTED_GENERAL",
];

const DISQUALIFYING_DISPOSITIONS: Disposition[] = [
  "NOT_INTERESTED",
  "DO_NOT_CALL",
  "WRONG_NUMBER",
  "ALREADY_PURCHASED",
  "BROKER",
  "CALL_ENDED_ABUSIVE",
];

export class PrismaDashboardRepository implements DashboardRepository {
  async getOverview(tenantId: string): Promise<DashboardOverviewOutput> {
    const [
      totalCampaigns,
      activeCampaigns,
      totalLeads,
      totalCalls,
      completedCalls,
      failedCalls,
      qualifiedLeads,
      notQualifiedLeads,
    ] = await Promise.all([
      prisma.campaign.count({ where: { tenantId } }),
      prisma.campaign.count({ where: { tenantId, status: "RUNNING" } }),
      prisma.lead.count({ where: { tenantId } }),
      prisma.call.count({ where: { tenantId } }),
      prisma.call.count({ where: { tenantId, status: "COMPLETED" } }),
      prisma.call.count({ where: { tenantId, status: "FAILED" } }),
      prisma.callAnalysis.count({
        where: {
          tenantId,
          disposition: { in: QUALIFYING_DISPOSITIONS },
        },
      }),
      prisma.callAnalysis.count({
        where: {
          tenantId,
          disposition: { in: DISQUALIFYING_DISPOSITIONS },
        },
      }),
    ]);

    const qualificationRate =
      totalLeads > 0 ? ((qualifiedLeads / totalLeads) * 100).toFixed(1) : "0";

    const callSuccessRate =
      totalCalls > 0 ? ((completedCalls / totalCalls) * 100).toFixed(1) : "0";

    return {
      campaigns: {
        total: totalCampaigns,
        active: activeCampaigns,
      },
      leads: {
        total: totalLeads,
        qualified: qualifiedLeads,
        notQualified: notQualifiedLeads,
        qualificationRate: `${qualificationRate}%`,
      },
      calls: {
        total: totalCalls,
        completed: completedCalls,
        failed: failedCalls,
        successRate: `${callSuccessRate}%`,
      },
    };
  }

  async getActivity(tenantId: string): Promise<DashboardActivityOutput> {
    const [recentCalls, qualifiedAnalyses, recentCampaigns] = await Promise.all([
      prisma.call.findMany({
        where: { tenantId },
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          lead: { select: { name: true, phone: true } },
          campaign: { select: { name: true } },
          callAnalysis: { select: { disposition: true, leadTemperature: true } },
        },
      }),
      prisma.callAnalysis.findMany({
        where: {
          tenantId,
          disposition: { in: QUALIFYING_DISPOSITIONS },
        },
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          call: {
            select: {
              leadId: true,
              lead: { select: { name: true, phone: true } },
              campaign: { select: { name: true } },
            },
          },
        },
      }),
      prisma.campaign.findMany({
        where: { tenantId },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      recentCalls: recentCalls.map((c) => ({
        id: c.id,
        bolnaCallId: c.bolnaCallId,
        status: c.status,
        duration: c.duration,
        platformCost: c.platformCost,
        recording: c.recording,
        startedAt: c.startedAt,
        createdAt: c.createdAt,
        lead: c.lead,
        campaign: c.campaign,
        callAnalysis: c.callAnalysis
          ? {
              disposition: c.callAnalysis.disposition,
              leadTemperature: c.callAnalysis.leadTemperature,
            }
          : null,
      })),
      qualifiedLeads: qualifiedAnalyses.map((qa) => ({
        leadId: qa.call.leadId,
        name: qa.call.lead.name,
        phone: qa.call.lead.phone,
        campaign: qa.call.campaign.name,
        disposition: qa.disposition,
        leadTemperature: qa.leadTemperature,
        qualifiedAt: qa.createdAt,
      })),
      recentCampaigns: recentCampaigns.map((rc) => ({
        id: qaCampaignMapHelper(rc.id), // placeholder mapper keeping type safe bindings
        name: rc.name,
        status: rc.status,
        totalLeads: rc.totalLeads,
        calledLeads: rc.calledLeads,
        completedLeads: rc.completedLeads,
        failedLeads: rc.failedLeads,
        createdAt: rc.createdAt,
      })),
    };
  }

  async getCampaignPerformance(tenantId: string): Promise<CampaignPerformanceOutput[]> {
    const campaigns = await prisma.campaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        assistant: { select: { name: true } },
      },
    });

    return campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      assistant: c.assistant.name,
      totalLeads: c.totalLeads,
      calledLeads: c.calledLeads,
      completedLeads: c.completedLeads,
      failedLeads: c.failedLeads,
      completedRate:
        c.calledLeads > 0
          ? ((c.completedLeads / c.calledLeads) * 100).toFixed(1) + "%"
          : "0%",
      progress:
        c.totalLeads > 0
          ? ((c.calledLeads / c.totalLeads) * 100).toFixed(1) + "%"
          : "0%",
      startedAt: c.startedAt,
      completedAt: c.completedAt,
      createdAt: c.createdAt,
    }));
  }
}

// Inline identity helper matching primitive UUID strings
function qaCampaignMapHelper(id: string): string {
  return id;
}