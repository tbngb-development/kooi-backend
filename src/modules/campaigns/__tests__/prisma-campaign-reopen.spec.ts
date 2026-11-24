import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaCampaignRepository } from "../infrastructure/repositories/prisma-campaign.repository";
import prisma from "../../../shared/config/database/prisma";

vi.mock("../../../shared/config/database/prisma", () => ({
  default: {
    campaign: {
      updateMany: vi.fn(),
    },
    lead: {
      count: vi.fn(),
    },
  },
}));

describe("PrismaCampaignRepository new-batch guards", () => {
  let repository: PrismaCampaignRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrismaCampaignRepository();
  });

  it("detects credit-enforcement stopped leads for a campaign", async () => {
    vi.mocked(prisma.lead.count).mockResolvedValueOnce(1);

    await expect(repository.hasLowBalanceStoppedLeads("campaign-1")).resolves.toBe(
      true,
    );
    expect(prisma.lead.count).toHaveBeenCalledWith({
      where: { campaignId: "campaign-1", stoppedReason: "LOW_BALANCE" },
    });
  });

  it("reopens only a normal terminal campaign through the atomic update", async () => {
    const now = new Date("2026-11-20T10:00:00.000Z");
    const startedAt = new Date("2026-11-20T09:00:00.000Z");
    vi.mocked(prisma.campaign.updateMany).mockResolvedValueOnce({ count: 1 });

    const reopened = await repository.reopenCampaignForNewBatch("campaign-1", {
      startedAt,
      now,
    });

    expect(reopened).toBe(true);
    const update = vi.mocked(prisma.campaign.updateMany).mock.calls[0][0];
    expect(update.data).toEqual({
      status: "RUNNING",
      completedAt: null,
      startedAt,
    });
    expect(update.where).toMatchObject({
      id: "campaign-1",
      isDeleted: false,
      status: { in: ["COMPLETED", "FAILED"] },
      leads: { none: { stoppedReason: "LOW_BALANCE" } },
    });
    expect((update.where as any).AND).toEqual([
      {
        OR: [
          { provider: { not: "SARVAM" } },
          { endTimestamp: null },
          { endTimestamp: { gt: now } },
        ],
      },
      {
        OR: [
          { provider: { not: "SARVAM" } },
          { sarvamStatus: null },
          {
            NOT: {
              sarvamStatus: { equals: "ended", mode: "insensitive" },
            },
          },
        ],
      },
    ]);
  });

  it("does not overwrite an existing startedAt when reopening", async () => {
    vi.mocked(prisma.campaign.updateMany).mockResolvedValueOnce({ count: 0 });

    const reopened = await repository.reopenCampaignForNewBatch("campaign-1", {
      startedAt: null,
    });

    expect(reopened).toBe(false);
    const update = vi.mocked(prisma.campaign.updateMany).mock.calls[0][0];
    expect(update.data).toEqual({
      status: "RUNNING",
      completedAt: null,
    });
  });
});
