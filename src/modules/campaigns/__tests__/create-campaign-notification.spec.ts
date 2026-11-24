import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignEntityData } from "../domain/entities/campaign.entity";
import type { CampaignRepository } from "../application/interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type { ITenantVoiceProviderService } from "../../tenants/application/services/tenant-voice-provider.service";
import type { Logger } from "../../../shared/logging/logger.interface";
import type { CampaignNotifications } from "../application/services/campaign-notifications";
import { CreateCampaignUseCase } from "../application/use-cases/create-campaign.use-case";

vi.mock("../../../shared/utils/tenant-freeze.guard", () => ({
  assertTenantNotFrozen: vi.fn().mockResolvedValue(undefined),
}));

const createdCampaign = {
  id: "camp-1",
  name: "Winter Sale 2026",
  tenantId: "tenant-1",
  status: "DRAFT",
  provider: "BOLNA",
  totalLeads: 0,
  createdAt: new Date("2026-11-17T09:00:00.000Z"),
} as CampaignEntityData;

describe("CreateCampaignUseCase — campaign.created notification", () => {
  let campaignRepo: CampaignRepository;
  let planRepo: PlanRepository;
  let voiceProviderService: ITenantVoiceProviderService;
  let logger: Logger;
  let notifications: CampaignNotifications;
  let useCase: CreateCampaignUseCase;

  beforeEach(() => {
    campaignRepo = {
      findAssistantWithAgent: vi.fn().mockResolvedValue({
        platformAgent: { requiredVariables: [] },
      }),
      create: vi.fn().mockResolvedValue(createdCampaign),
    } as unknown as CampaignRepository;

    planRepo = {
      getActivePlanForTenant: vi
        .fn()
        .mockResolvedValue({ maxActiveCampaigns: null, retryAutomation: false }),
    } as unknown as PlanRepository;

    voiceProviderService = {
      resolveActiveProvider: vi.fn().mockResolvedValue({ provider: "BOLNA" }),
    } as unknown as ITenantVoiceProviderService;

    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    notifications = {
      publishCreated: vi.fn().mockResolvedValue(undefined),
      publishCompleted: vi.fn().mockResolvedValue(undefined),
    } as unknown as CampaignNotifications;

    useCase = new CreateCampaignUseCase(
      campaignRepo,
      planRepo,
      voiceProviderService,
      undefined,
      undefined,
      logger,
      notifications,
    );
  });

  it("publishes campaign.created after a campaign is persisted", async () => {
    const result = await useCase.execute("tenant-1", {
      name: "Winter Sale 2026",
      assistantId: "asst-1",
      variables: {},
    });

    expect(result).toBe(createdCampaign);
    expect(notifications.publishCreated).toHaveBeenCalledWith(createdCampaign);
  });

  it("does not publish when campaign creation fails before persistence", async () => {
    vi.mocked(campaignRepo.create).mockRejectedValueOnce(new Error("db error"));

    await expect(
      useCase.execute("tenant-1", {
        name: "Winter Sale 2026",
        assistantId: "asst-1",
        variables: {},
      }),
    ).rejects.toThrow("db error");

    expect(notifications.publishCreated).not.toHaveBeenCalled();
  });

  it("does not fail campaign creation when notification publishing throws", async () => {
    vi.mocked(notifications.publishCreated).mockRejectedValueOnce(
      new Error("service down"),
    );

    await expect(
      useCase.execute("tenant-1", {
        name: "Winter Sale 2026",
        assistantId: "asst-1",
        variables: {},
      }),
    ).resolves.toBe(createdCampaign);
    expect(logger.error).toHaveBeenCalledWith(
      "failed to publish campaign.created event",
      expect.anything(),
      expect.objectContaining({ campaignId: "camp-1" }),
    );
  });
});
