import type { CampaignEntityData } from "../../domain/entities/campaign.entity";
import type {
  DiscordEvent,
  IDiscordEventsPublisher,
} from "../../../../shared/config/external/notifications/discordevents-publisher";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface CampaignNotificationsDeps {
  findCampaign(campaignId: string): Promise<CampaignEntityData | null>;
  getTenantName(tenantId: string): Promise<string | null>;
  publisher: IDiscordEventsPublisher;
  logger?: Logger;
}

/**
 * Shared emitter for the internal `campaign.created` / `campaign.completed`
 * events. Only operational, allow-listed fields are published; the service
 * rejects contact data and raw URLs before delivery. Publishing is best-effort
 * and never fails the KOOI business operation that produced the event.
 */
export class CampaignNotifications {
  private readonly findCampaign: CampaignNotificationsDeps["findCampaign"];
  private readonly getTenantName: CampaignNotificationsDeps["getTenantName"];
  private readonly publisher: IDiscordEventsPublisher;
  private readonly logger?: Logger;

  constructor(deps: CampaignNotificationsDeps) {
    this.findCampaign = deps.findCampaign;
    this.getTenantName = deps.getTenantName;
    this.publisher = deps.publisher;
    this.logger = deps.logger;
  }

  async publishCreated(campaign: CampaignEntityData): Promise<void> {
    await this.publish(
      "campaign.created",
      {
        eventId: `campaign.created:${campaign.id}:created`,
        occurredAt: campaign.createdAt,
        campaign,
        data: {
          tenantName: await this.resolveTenantName(campaign.tenantId),
          tenantId: campaign.tenantId,
          campaignId: campaign.id,
          campaignName: campaign.name,
          provider: campaign.provider === "SARVAM" ? "SARVAM" : "BOLNA",
          status: "DRAFT",
          totalLeads: campaign.totalLeads,
          dashboardPath: `/campaigns/${campaign.id}`,
        },
      },
      campaign.id,
    );
  }

  async publishCompleted(campaignId: string, completedAt: Date): Promise<void> {
    let campaign: CampaignEntityData | null;
    try {
      campaign = await this.findCampaign(campaignId);
    } catch (error) {
      this.logger?.error("failed to load campaign for completion event", error, {
        action: "notification.publish_failed",
        campaignId,
      });
      return;
    }

    if (!campaign) {
      this.logger?.warn("campaign not found for completion event", {
        action: "notification.publish_skipped",
        campaignId,
      });
      return;
    }

    await this.publish(
      "campaign.completed",
      {
        eventId: `campaign.completed:${campaignId}:${completedAt.getTime()}`,
        occurredAt: completedAt,
        campaign,
        data: {
          tenantName: await this.resolveTenantName(campaign.tenantId),
          tenantId: campaign.tenantId,
          campaignId,
          campaignName: campaign.name,
          provider: campaign.provider === "SARVAM" ? "SARVAM" : "BOLNA",
          totalLeads: campaign.totalLeads,
          calledLeads: campaign.calledLeads,
          completedLeads: campaign.completedLeads,
          failedLeads: campaign.failedLeads,
          dashboardPath: `/campaigns/${campaignId}`,
        },
      },
      campaignId,
    );
  }

  private async resolveTenantName(tenantId: string): Promise<string> {
    try {
      return (await this.getTenantName(tenantId)) ?? tenantId;
    } catch {
      return tenantId;
    }
  }

  private async publish(
    eventType: "campaign.created" | "campaign.completed",
    input: {
      eventId: string;
      occurredAt: Date;
      campaign: CampaignEntityData;
      data: Record<string, unknown>;
    },
    campaignId: string,
  ): Promise<void> {
    const event: DiscordEvent = {
      eventId: input.eventId,
      eventType,
      eventVersion: 1,
      occurredAt: input.occurredAt.toISOString(),
      tenantId: input.campaign.tenantId,
      source: "kooi-backend",
      data: input.data,
    };

    try {
      await this.publisher.publish(event);
    } catch (error) {
      this.logger?.error(`failed to publish ${eventType} event`, error, {
        action: "notification.publish_failed",
        campaignId,
      });
    }
  }
}
