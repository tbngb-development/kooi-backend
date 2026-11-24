import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../../../shared/config/database/prisma";
import { PrismaSarvamWebhookRepository } from "../prisma-sarvam-webhook.repository";

vi.mock("../../../../../shared/config/database/prisma", () => ({
  default: {
    campaign: {
      updateMany: vi.fn(),
    },
  },
}));

describe("PrismaSarvamWebhookRepository — guarded campaign start", () => {
  let repository: PrismaSarvamWebhookRepository;
  const updateMany = vi.mocked(prisma.campaign.updateMany);

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrismaSarvamWebhookRepository();
    updateMany.mockResolvedValue({ count: 1 });
  });

  it("starts only an unstarted campaign in one atomic statement", async () => {
    const started = await repository.markCampaignRunningIfActive("campaign-1");

    expect(started).toBe(true);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "campaign-1",
        status: { in: ["DRAFT", "SCHEDULED"] },
      },
      data: { status: "RUNNING", startedAt: expect.any(Date) },
    });
  });

  it("reports false without writing when the campaign is already finalized", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    const started = await repository.markCampaignRunningIfActive("campaign-1");

    expect(started).toBe(false);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0]?.[0]?.where).toMatchObject({
      status: { in: ["DRAFT", "SCHEDULED"] },
    });
  });
});
