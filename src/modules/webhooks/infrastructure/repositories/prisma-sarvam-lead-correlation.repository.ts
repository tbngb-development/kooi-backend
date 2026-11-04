import prisma from "../../../../shared/config/database/prisma";
import type {
  ISarvamLeadCorrelationRepository,
  CampaignCorrelationCandidate,
  BatchCorrelationCandidate,
  LeadCorrelationCandidate,
} from "../../application/interfaces/sarvam-lead-correlation.interface";

export class PrismaSarvamLeadCorrelationRepository
  implements ISarvamLeadCorrelationRepository
{
  async findCampaignsBySarvamId(
    sarvamCampaignId: string,
  ): Promise<CampaignCorrelationCandidate[]> {
    return prisma.campaign.findMany({
      where: { sarvamCampaignId },
      select: {
        id: true,
        name: true,
        tenantId: true,
        provider: true,
        sarvamCampaignId: true,
        sarvamAgentId: true,
        status: true,
        isDeleted: true,
        sarvamAgent: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });
  }

  async findBatchesBySarvamCohortId(
    sarvamCohortId: string,
  ): Promise<BatchCorrelationCandidate[]> {
    return prisma.leadBatch.findMany({
      where: { sarvamCohortId },
      select: {
        id: true,
        name: true,
        tenantId: true,
        campaignId: true,
        provider: true,
        sarvamCohortId: true,
        status: true,
        isDeleted: true,
      },
    });
  }

  async findLeadsByBatchAndPhone(
    batchId: string,
    normalizedPhone: string,
  ): Promise<LeadCorrelationCandidate[]> {
    return prisma.lead.findMany({
      where: {
        batchId,
        phone: normalizedPhone,
      },
      select: {
        id: true,
        phone: true,
        name: true,
        status: true,
        tenantId: true,
        campaignId: true,
        batchId: true,
        metadata: true,
        isDeleted: true,
      },
    });
  }
}

