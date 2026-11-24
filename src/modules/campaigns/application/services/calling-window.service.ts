import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import {
  resolveCallingWindow,
  type CallingWindow,
} from "../../../../shared/utils/calling-window";

/**
 * D1: campaign overrides win; otherwise assistant campaigns use the industry
 * pack and Sarvam campaigns use the agent's allowed schedule.
 */
export class CallingWindowService {
  constructor(private readonly campaignRepo: CampaignRepository) {}

  async resolveWindow(
    tenantId: string,
    campaignId: string,
  ): Promise<CallingWindow | null> {
    const contextPromise: Promise<{
      industryCallingHours?: unknown;
      sarvamSchedule?: unknown;
    }> = this.campaignRepo.getCallingWindowContext
      ? this.campaignRepo.getCallingWindowContext(tenantId, campaignId)
      : Promise.resolve({});
    const [campaign, context] = await Promise.all([
      this.campaignRepo.findById(tenantId, campaignId),
      contextPromise,
    ]);

    if (!campaign) return null;

    return resolveCallingWindow({
      campaignSchedule: campaign.allowedSchedule,
      provider: campaign.provider,
      industryCallingHours: context.industryCallingHours,
      sarvamSchedule: context.sarvamSchedule,
    });
  }
}
