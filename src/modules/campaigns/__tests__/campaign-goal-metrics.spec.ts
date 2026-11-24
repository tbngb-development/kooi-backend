import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetCampaignGoalMetricsUseCase } from "../application/use-cases/get-campaign-goal-metrics.use-case";
import type { CampaignRepository } from "../application/interfaces/campaign-repository.interface";
import type { CampaignGoalMetricsResult } from "../application/dto/campaign.dto";

describe("Phase 5: Campaign Goal Analytics API Suite", () => {
  let useCase: GetCampaignGoalMetricsUseCase;
  let mockCampaignRepo: CampaignRepository;

  const tenantId = "tenant-uuid-1";
  const campaignId = "campaign-uuid-1";
  const batchId = "batch-uuid-1";

  const expectedResult: CampaignGoalMetricsResult = {
    campaignId,
    batchId,
    totalCalls: 100,
    anyGoalPassedCalls: 45,
    overallGoalRate: 45.0,
    goals: [
      {
        goalId: "goal-uuid-1",
        displayName: "Interested Customer",
        outputVariableName: "customer_interest",
        expectedValue: "interested",
        reachedCalls: 35,
        totalCalls: 100,
        achievementRate: 35.0,
      },
      {
        goalId: "goal-uuid-2",
        displayName: "Site Visit Requested",
        outputVariableName: "site_visit",
        expectedValue: "yes",
        reachedCalls: 20,
        totalCalls: 100,
        achievementRate: 20.0,
      },
    ],
  };

  beforeEach(() => {
    mockCampaignRepo = {
      getCampaignGoalMetrics: vi.fn().mockResolvedValue(expectedResult),
    } as unknown as CampaignRepository;

    useCase = new GetCampaignGoalMetricsUseCase(mockCampaignRepo);
  });

  it("delegates to campaignRepo with tenantId, campaignId, and optional batchId", async () => {
    const result = await useCase.execute({
      tenantId,
      campaignId,
      batchId,
    });

    expect(mockCampaignRepo.getCampaignGoalMetrics).toHaveBeenCalledWith(
      tenantId,
      campaignId,
      batchId,
    );
    expect(result).toEqual(expectedResult);
    expect(result.goals).toHaveLength(2);
    expect(result.overallGoalRate).toBe(45.0);
  });

  it("handles empty goals gracefully without error", async () => {
    const emptyResult: CampaignGoalMetricsResult = {
      campaignId,
      batchId: null,
      totalCalls: 50,
      anyGoalPassedCalls: 0,
      overallGoalRate: 0,
      goals: [],
    };

    (mockCampaignRepo.getCampaignGoalMetrics as any).mockResolvedValue(emptyResult);

    const result = await useCase.execute({
      tenantId,
      campaignId,
    });

    expect(result.goals).toHaveLength(0);
    expect(result.overallGoalRate).toBe(0);
  });
});
