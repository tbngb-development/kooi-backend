import prisma from "../../../../shared/config/database/prisma";
import type { TestCallCandidate } from "../dto/test-extraction.dto";

export interface ListTestCallCandidatesParams {
  platformAgentId: string;
  search?: string;
  limit?: number;
}

export class ListTestCallCandidatesUseCase {
  async execute(
    params: ListTestCallCandidatesParams,
  ): Promise<TestCallCandidate[]> {
    const limit = params.limit ?? 20;
    const search = params.search?.trim();

    // 1. Fetch campaigns that use this platform agent
    const agentCampaigns = await prisma.campaign.findMany({
      where: {
        assistant: {
          platformAgentId: params.platformAgentId,
        },
        isDeleted: false,
      },
      select: { id: true },
    });
    const agentCampaignIds = agentCampaigns.map((c) => c.id);

    // 2. Build where filter for completed calls with transcripts
    const baseWhere: any = {
      status: "COMPLETED",
      transcript: { not: null },
      isDeleted: false,
    };

    if (search) {
      baseWhere.OR = [
        { id: { contains: search, mode: "insensitive" } },
        { lead: { phone: { contains: search } } },
        { lead: { name: { contains: search, mode: "insensitive" } } },
        { campaign: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    // 3. Query calls, prioritizing calls from campaigns using this platform agent
    const calls = await prisma.call.findMany({
      where: baseWhere,
      take: limit * 2, // Fetch a larger candidate pool to sort by agent relevance
      orderBy: { endedAt: "desc" },
      select: {
        id: true,
        duration: true,
        endedAt: true,
        transcript: true,
        campaignId: true,
        lead: {
          select: {
            phone: true,
            name: true,
          },
        },
        campaign: {
          select: {
            name: true,
            assistant: {
              select: {
                platformAgentId: true,
              },
            },
          },
        },
        tenant: {
          select: {
            name: true,
          },
        },
      },
    });

    // 4. Transform and sort candidates (calls matching this agent first)
    const candidates: TestCallCandidate[] = calls
      .filter((c) => c.transcript && c.transcript.trim().length > 0)
      .map((c) => {
        const transcriptText = c.transcript!.trim();
        const snippet =
          transcriptText.length > 180
            ? `${transcriptText.slice(0, 180)}...`
            : transcriptText;

        const isFromThisAgent =
          agentCampaignIds.includes(c.campaignId) ||
          c.campaign?.assistant?.platformAgentId === params.platformAgentId;

        return {
          id: c.id,
          leadPhone: c.lead?.phone ?? "Unknown Phone",
          leadName: c.lead?.name ?? null,
          campaignName: c.campaign?.name ?? "Unknown Campaign",
          tenantName: c.tenant?.name ?? "Unknown Tenant",
          duration: c.duration,
          endedAt: c.endedAt ? c.endedAt.toISOString() : null,
          transcriptSnippet: snippet,
          transcriptLength: transcriptText.length,
          isFromThisAgent,
        };
      });

    // Sort: calls from this agent first, then by endedAt desc
    candidates.sort((a, b) => {
      if (a.isFromThisAgent && !b.isFromThisAgent) return -1;
      if (!a.isFromThisAgent && b.isFromThisAgent) return 1;
      return 0;
    });

    return candidates.slice(0, limit);
  }
}
