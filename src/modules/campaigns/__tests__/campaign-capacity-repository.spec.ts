import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrismaCampaignRepository } from "../infrastructure/repositories/prisma-campaign.repository";
import prisma from "../../../shared/config/database/prisma";

vi.mock("../../../shared/config/database/prisma", () => ({
  default: {
    campaign: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    lead: {
      groupBy: vi.fn(),
    },
    leadBatch: {
      groupBy: vi.fn(),
    },
  },
}));

describe("PrismaCampaignRepository - countActiveCampaignsForAgent", () => {
  let repository: PrismaCampaignRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrismaCampaignRepository();
  });

  it("counts active RUNNING campaigns for a Sarvam agent with isDeleted: false", async () => {
    vi.mocked(prisma.campaign.count).mockResolvedValue(3);

    const count = await repository.countActiveCampaignsForAgent("sarvam-agent-1");

    expect(count).toBe(3);
    expect(prisma.campaign.count).toHaveBeenCalledWith({
      where: {
        sarvamAgentId: "sarvam-agent-1",
        status: "RUNNING",
        isDeleted: false,
      },
    });
  });

  it("excludes specific campaignId when excludeCampaignId is provided", async () => {
    vi.mocked(prisma.campaign.count).mockResolvedValue(4);

    const count = await repository.countActiveCampaignsForAgent(
      "sarvam-agent-1",
      "campaign-exclude-123",
    );

    expect(count).toBe(4);
    expect(prisma.campaign.count).toHaveBeenCalledWith({
      where: {
        sarvamAgentId: "sarvam-agent-1",
        status: "RUNNING",
        isDeleted: false,
        id: { not: "campaign-exclude-123" },
      },
    });
  });

  it("returns 0 when no active campaigns exist for the agent", async () => {
    vi.mocked(prisma.campaign.count).mockResolvedValue(0);

    const count = await repository.countActiveCampaignsForAgent("sarvam-agent-empty");

    expect(count).toBe(0);
    expect(prisma.campaign.count).toHaveBeenCalledWith({
      where: {
        sarvamAgentId: "sarvam-agent-empty",
        status: "RUNNING",
        isDeleted: false,
      },
    });
  });

  describe("findActiveSarvamCampaignsForAgent", () => {
    it("queries campaigns with provider SARVAM, isDeleted false, and notIn CANCELLED/PAUSED", async () => {
      vi.mocked(prisma.campaign.findMany).mockResolvedValue([
        {
          id: "camp-active-1",
          name: "Active 1",
          status: "RUNNING",
          sarvamStatus: "active",
          tenantId: "tenant-1",
          sarvamAgentId: "sarvam-agent-1",
          batches: [],
          isDeleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ]);
      vi.mocked(prisma.lead.groupBy).mockResolvedValue([]);
      vi.mocked(prisma.leadBatch.groupBy).mockResolvedValue([]);

      const result = await repository.findActiveSarvamCampaignsForAgent(
        "tenant-1",
        "sarvam-agent-1",
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("camp-active-1");
      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-1",
            sarvamAgentId: "sarvam-agent-1",
            provider: "SARVAM",
            isDeleted: false,
            sarvamCampaignId: { not: null },
            status: { notIn: ["CANCELLED", "PAUSED"] },
            AND: [
              {
                OR: [
                  { sarvamStatus: null },
                  { sarvamStatus: { notIn: ["ended", "cancelled", "paused"] } },
                ],
              },
            ],
          }),
        }),
      );
    });
  });
});

