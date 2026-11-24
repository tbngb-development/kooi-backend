import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignRepository } from "../application/interfaces/campaign-repository.interface";
import {
  assertCampaignAcceptsNewBatch,
  reopenCampaignForNewBatchIfNeeded,
} from "../application/services/campaign-new-batch-guard";
import {
  CampaignNotEligibleForUploadError,
  CampaignStoppedForLowBalanceError,
} from "../domain/errors/campaign.errors";

describe("campaign new-batch guard", () => {
  const tenantId = "tenant-1";
  const campaignId = "campaign-1";
  let repo: {
    findByIdWithRelations: ReturnType<typeof vi.fn>;
    hasLowBalanceStoppedLeads: ReturnType<typeof vi.fn>;
    reopenCampaignForNewBatch: ReturnType<typeof vi.fn>;
  };

  const campaign = (overrides: Record<string, unknown> = {}) => ({
    id: campaignId,
    tenantId,
    status: "COMPLETED",
    provider: "BOLNA",
    sarvamStatus: null,
    endTimestamp: null,
    startedAt: null,
    assistant: { id: "assistant-1" },
    ...overrides,
  });

  beforeEach(() => {
    repo = {
      findByIdWithRelations: vi.fn().mockResolvedValue(campaign()),
      hasLowBalanceStoppedLeads: vi.fn().mockResolvedValue(false),
      reopenCampaignForNewBatch: vi.fn().mockResolvedValue(true),
    };
  });

  it("requires a guarded reopen for a normal terminal campaign", async () => {
    const result = await assertCampaignAcceptsNewBatch(
      repo as unknown as CampaignRepository,
      tenantId,
      campaignId,
    );

    expect(result.needsReopen).toBe(true);
    expect(repo.hasLowBalanceStoppedLeads).toHaveBeenCalledWith(campaignId);
  });

  it("reopens a normal terminal campaign with an atomic guard and clears completion", async () => {
    await reopenCampaignForNewBatchIfNeeded(
      repo as unknown as CampaignRepository,
      tenantId,
      campaignId,
      true,
    );

    expect(repo.reopenCampaignForNewBatch).toHaveBeenCalledWith(campaignId, {
      startedAt: expect.any(Date),
    });
  });

  it("does not reopen an already-active campaign", async () => {
    await reopenCampaignForNewBatchIfNeeded(
      repo as unknown as CampaignRepository,
      tenantId,
      campaignId,
      false,
    );

    expect(repo.reopenCampaignForNewBatch).not.toHaveBeenCalled();
  });

  it("rejects CANCELLED campaigns", async () => {
    repo.findByIdWithRelations.mockResolvedValue(
      campaign({ status: "CANCELLED" }),
    );

    await expect(
      assertCampaignAcceptsNewBatch(
        repo as unknown as CampaignRepository,
        tenantId,
        campaignId,
      ),
    ).rejects.toThrow(CampaignNotEligibleForUploadError);
  });

  it("rejects credit-enforcement-stopped campaigns", async () => {
    repo.hasLowBalanceStoppedLeads.mockResolvedValue(true);

    await expect(
      assertCampaignAcceptsNewBatch(
        repo as unknown as CampaignRepository,
        tenantId,
        campaignId,
      ),
    ).rejects.toThrow(CampaignStoppedForLowBalanceError);
    expect(repo.reopenCampaignForNewBatch).not.toHaveBeenCalled();
  });

  it("rejects expired Sarvam campaigns", async () => {
    repo.findByIdWithRelations.mockResolvedValue(
      campaign({
        provider: "SARVAM",
        endTimestamp: new Date(Date.now() - 60_000),
      }),
    );

    await expect(
      assertCampaignAcceptsNewBatch(
        repo as unknown as CampaignRepository,
        tenantId,
        campaignId,
      ),
    ).rejects.toThrow("Cannot upload batches to an ended campaign.");
  });

  it("does not throw when a concurrent request already reopened the campaign", async () => {
    repo.reopenCampaignForNewBatch.mockResolvedValue(false);
    repo.findByIdWithRelations.mockResolvedValueOnce(
      campaign({ status: "RUNNING", startedAt: new Date() }),
    );

    await expect(
      reopenCampaignForNewBatchIfNeeded(
        repo as unknown as CampaignRepository,
        tenantId,
        campaignId,
        true,
      ),
    ).resolves.toBe(false);
  });

  it("allows a concurrent pause after a failed reopen guard", async () => {
    repo.reopenCampaignForNewBatch.mockResolvedValue(false);
    repo.findByIdWithRelations.mockResolvedValueOnce(
      campaign({ status: "PAUSED" }),
    );

    await expect(
      reopenCampaignForNewBatchIfNeeded(
        repo as unknown as CampaignRepository,
        tenantId,
        campaignId,
        true,
      ),
    ).resolves.toBe(false);
  });

  it("throws when the atomic reopen lost to a credit-enforcement stop", async () => {
    repo.reopenCampaignForNewBatch.mockResolvedValue(false);
    repo.hasLowBalanceStoppedLeads.mockResolvedValueOnce(true);
    repo.findByIdWithRelations.mockResolvedValue(campaign());

    await expect(
      reopenCampaignForNewBatchIfNeeded(
        repo as unknown as CampaignRepository,
        tenantId,
        campaignId,
        true,
      ),
    ).rejects.toThrow(CampaignStoppedForLowBalanceError);
  });
});
