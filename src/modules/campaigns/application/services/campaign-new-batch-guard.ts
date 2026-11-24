import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import {
  CampaignNotEligibleForUploadError,
  CampaignNotFoundError,
  CampaignStoppedForLowBalanceError,
} from "../../domain/errors/campaign.errors";
import { evaluateNewBatchEligibility } from "../../domain/rules/new-batch-eligibility.rules";

type CampaignWithRelations = NonNullable<
  Awaited<ReturnType<CampaignRepository["findByIdWithRelations"]>>
>;

export interface NewBatchGuardResult {
  campaign: CampaignWithRelations;
  needsReopen: boolean;
}

/**
 * Fails fast when a user tries to add/start work on a campaign that must stay
 * terminal. Callers may pass an already-loaded campaign (workers do this) to
 * avoid a duplicate read; the LOW_BALANCE marker is always read fresh.
 */
export async function assertCampaignAcceptsNewBatch(
  campaignRepo: CampaignRepository,
  tenantId: string,
  campaignId: string,
  existingCampaign?: CampaignWithRelations | null,
): Promise<NewBatchGuardResult> {
  const campaign =
    existingCampaign ??
    (await campaignRepo.findByIdWithRelations(tenantId, campaignId));
  if (!campaign) {
    throw new CampaignNotFoundError();
  }

  const hasLowBalanceLeads =
    typeof campaignRepo.hasLowBalanceStoppedLeads === "function"
      ? await campaignRepo.hasLowBalanceStoppedLeads(campaignId)
      : false;
  const eligibility = evaluateNewBatchEligibility({
    status: campaign.status,
    provider: campaign.provider,
    endTimestamp: campaign.endTimestamp,
    sarvamStatus: campaign.sarvamStatus,
    hasLowBalanceLeads,
  });

  if (!eligibility.allowed) {
    switch (eligibility.reason) {
      case "LOW_BALANCE":
        throw new CampaignStoppedForLowBalanceError();
      case "ENDED":
        throw new CampaignNotEligibleForUploadError("ended");
      case "CANCELLED":
        throw new CampaignNotEligibleForUploadError(campaign.status);
    }
  }

  return { campaign, needsReopen: eligibility.needsReopen };
}

/**
 * Applies the atomic reopen after the new batch/work has been accepted. If the
 * guarded UPDATE matched no row, re-check eligibility: a concurrent request
 * may already have reopened the campaign (benign), or credit enforcement may
 * have made it permanently terminal (must throw).
 */
export async function reopenCampaignForNewBatchIfNeeded(
  campaignRepo: CampaignRepository,
  tenantId: string,
  campaignId: string,
  needsReopen: boolean,
  startedAt?: Date | null,
): Promise<boolean> {
  if (!needsReopen) {
    return false;
  }

  const reopened = await campaignRepo.reopenCampaignForNewBatch(campaignId, {
    startedAt: startedAt === undefined ? new Date() : startedAt,
  });
  if (reopened) {
    return true;
  }

  const recheck = await assertCampaignAcceptsNewBatch(
    campaignRepo,
    tenantId,
    campaignId,
  );
  if (recheck.needsReopen) {
    throw new CampaignNotEligibleForUploadError(recheck.campaign.status);
  }
  return false;
}
