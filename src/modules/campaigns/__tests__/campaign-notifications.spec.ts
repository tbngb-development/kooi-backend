import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { CampaignEntityData } from "../domain/entities/campaign.entity";
import type {
  DiscordEvent,
  IDiscordEventsPublisher,
} from "../../../shared/config/external/notifications/discordevents-publisher";
import type { Logger } from "../../../shared/logging/logger.interface";
import { CampaignNotifications } from "../application/services/campaign-notifications";

const campaign: CampaignEntityData = {
  id: "camp-1",
  name: "Winter Sale 2026",
  description: null,
  status: "COMPLETED",
  tenantId: "tenant-1",
  assistantId: "asst-1",
  sarvamAgentId: null,
  provider: "SARVAM",
  sarvamCampaignId: "sarvam-camp-1",
  sarvamStatus: "ended",
  startTimestamp: null,
  endTimestamp: null,
  allowedSchedule: null,
  variables: {},
  defaultRetryConfig: null,
  totalLeads: 100,
  calledLeads: 95,
  completedLeads: 80,
  failedLeads: 15,
  startedAt: new Date("2026-11-17T10:00:00.000Z"),
  completedAt: new Date("2026-11-17T12:00:00.000Z"),
  createdAt: new Date("2026-11-17T09:00:00.000Z"),
  updatedAt: new Date("2026-11-17T12:00:00.000Z"),
  isDeleted: false,
  deletedAt: null,
};

describe("CampaignNotifications", () => {
  let publisher: IDiscordEventsPublisher;
  let logger: Logger;
  let findCampaign: Mock<
    (campaignId: string) => Promise<CampaignEntityData | null>
  >;
  let notifications: CampaignNotifications;

  function publishedEvent(): DiscordEvent {
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    return vi.mocked(publisher.publish).mock.calls[0][0];
  }

  beforeEach(() => {
    publisher = { publish: vi.fn().mockResolvedValue(undefined) };
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;
    findCampaign = vi
      .fn<(campaignId: string) => Promise<CampaignEntityData | null>>()
      .mockResolvedValue(campaign);
    notifications = new CampaignNotifications({
      findCampaign,
      getTenantName: vi.fn().mockResolvedValue("Acme Motors"),
      publisher,
      logger,
    });
  });

  it("publishes a versioned campaign.created envelope with allow-listed fields", async () => {
    await notifications.publishCreated(campaign);

    expect(publishedEvent()).toMatchObject({
      eventId: "campaign.created:camp-1:created",
      eventType: "campaign.created",
      eventVersion: 1,
      occurredAt: "2026-11-17T09:00:00.000Z",
      tenantId: "tenant-1",
      source: "kooi-backend",
      data: {
        tenantName: "Acme Motors",
        tenantId: "tenant-1",
        campaignId: "camp-1",
        campaignName: "Winter Sale 2026",
        provider: "SARVAM",
        status: "DRAFT",
        totalLeads: 100,
        dashboardPath: "/campaigns/camp-1",
      },
    });
  });

  it("publishes a versioned campaign.completed envelope with final counters", async () => {
    await notifications.publishCompleted(
      "camp-1",
      new Date("2026-11-17T12:00:00.000Z"),
    );

    expect(publishedEvent()).toMatchObject({
      eventId: "campaign.completed:camp-1:1794916800000",
      eventType: "campaign.completed",
      eventVersion: 1,
      occurredAt: "2026-11-17T12:00:00.000Z",
      tenantId: "tenant-1",
      source: "kooi-backend",
      data: {
        tenantName: "Acme Motors",
        tenantId: "tenant-1",
        campaignId: "camp-1",
        campaignName: "Winter Sale 2026",
        provider: "SARVAM",
        totalLeads: 100,
        calledLeads: 95,
        completedLeads: 80,
        failedLeads: 15,
        dashboardPath: "/campaigns/camp-1",
      },
    });
  });

  it("falls back to the tenant id when the tenant name is missing", async () => {
    notifications = new CampaignNotifications({
      findCampaign,
      getTenantName: vi.fn().mockResolvedValue(null),
      publisher,
      logger,
    });

    await notifications.publishCreated(campaign);

    expect(publishedEvent().data.tenantName).toBe("tenant-1");
  });

  it("skips completion when the campaign cannot be found", async () => {
    findCampaign.mockResolvedValueOnce(null);

    await notifications.publishCompleted("missing", new Date());

    expect(publisher.publish).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("does not fail notification when publishing throws", async () => {
    vi.mocked(publisher.publish).mockRejectedValueOnce(new Error("service down"));

    await expect(notifications.publishCreated(campaign)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      "failed to publish campaign.created event",
      expect.anything(),
      expect.objectContaining({ campaignId: "camp-1" }),
    );
  });
});
