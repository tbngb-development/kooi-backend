import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrismaCampaignRepository } from "../infrastructure/repositories/prisma-campaign.repository";
import prisma from "../../../shared/config/database/prisma";

vi.mock("../../../shared/config/database/prisma", () => ({
  default: {
    campaign: {
      count: vi.fn(),
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
});

