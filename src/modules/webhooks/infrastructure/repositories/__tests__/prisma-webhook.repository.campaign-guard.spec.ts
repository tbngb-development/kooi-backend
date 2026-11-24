import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../../../shared/config/database/prisma";
import { PrismaWebhookRepository } from "../prisma-webhook.repository";

vi.mock("../../../../../shared/config/database/prisma", () => ({
  default: {
    campaign: {
      updateMany: vi.fn(),
    },
  },
}));

describe("PrismaWebhookRepository — guarded campaign RUNNING update", () => {
  let repository: PrismaWebhookRepository;
  const updateMany = vi.mocked(prisma.campaign.updateMany);

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrismaWebhookRepository();
    updateMany.mockResolvedValue({ count: 1 });
  });

  it("updates only active campaigns in one atomic statement", async () => {
    const startedAt = new Date("2026-11-20T10:00:00Z");

    const updated = await repository.markCampaignRunningIfActive(
      "campaign-1",
      startedAt,
    );

    expect(updated).toBe(true);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "campaign-1",
        status: { in: ["DRAFT", "SCHEDULED", "RUNNING"] },
      },
      data: { status: "RUNNING", startedAt },
    });
  });

  it("does not require a timestamp for scheduled retry events", async () => {
    const updated = await repository.markCampaignRunningIfActive("campaign-1");

    expect(updated).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "campaign-1",
        status: { in: ["DRAFT", "SCHEDULED", "RUNNING"] },
      },
      data: { status: "RUNNING" },
    });
  });

  it("reports false without writing when the campaign is already terminal", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    const updated = await repository.markCampaignRunningIfActive("campaign-1");

    expect(updated).toBe(false);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0]?.[0]?.where).toMatchObject({
      status: { in: ["DRAFT", "SCHEDULED", "RUNNING"] },
    });
  });
});
