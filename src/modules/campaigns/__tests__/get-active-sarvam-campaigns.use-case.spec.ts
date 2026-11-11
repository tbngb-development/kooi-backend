import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetActiveSarvamCampaignsUseCase } from "../application/use-cases/get-active-sarvam-campaigns.use-case";
import type { CampaignRepository } from "../application/interfaces/campaign-repository.interface";
import { CampaignSarvamAgentRequiredError } from "../domain/errors/campaign.errors";

describe("GetActiveSarvamCampaignsUseCase", () => {
  let useCase: GetActiveSarvamCampaignsUseCase;
  let mockCampaignRepo: Partial<CampaignRepository>;

  const tenantId = "tenant-uuid-123";
  const sarvamAgentId = "sarvam-agent-uuid-456";

  beforeEach(() => {
    mockCampaignRepo = {
      findActiveSarvamCampaignsForAgent: vi.fn(),
    };
    useCase = new GetActiveSarvamCampaignsUseCase(mockCampaignRepo as CampaignRepository);
  });

  it("throws CampaignSarvamAgentRequiredError when sarvamAgentId is missing or empty", async () => {
    await expect(
      useCase.execute({ tenantId, sarvamAgentId: "" }),
    ).rejects.toThrow(CampaignSarvamAgentRequiredError);

    expect(mockCampaignRepo.findActiveSarvamCampaignsForAgent).not.toHaveBeenCalled();
  });

  it("returns active Sarvam campaigns for the specified agent", async () => {
    const mockCampaigns = [
      {
        id: "camp-1",
        name: "Campaign 1",
        status: "RUNNING",
        sarvamStatus: "active",
        totalLeads: 100,
        calledLeads: 50,
      },
      {
        id: "camp-2",
        name: "Campaign 2",
        status: "DRAFT",
        sarvamStatus: "scheduled",
        totalLeads: 200,
        calledLeads: 0,
      },
    ] as any;

    vi.mocked(mockCampaignRepo.findActiveSarvamCampaignsForAgent!).mockResolvedValue(mockCampaigns);

    const result = await useCase.execute({ tenantId, sarvamAgentId });

    expect(result).toEqual(mockCampaigns);
    expect(mockCampaignRepo.findActiveSarvamCampaignsForAgent).toHaveBeenCalledWith(
      tenantId,
      sarvamAgentId,
    );
  });
});

