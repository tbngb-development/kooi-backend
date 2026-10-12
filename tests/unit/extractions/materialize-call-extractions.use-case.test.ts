import { describe, it, expect, vi, beforeEach } from "vitest";
import { MaterializeCallExtractionsUseCase } from "../../../src/modules/extractions/application/use-cases/materialize-call-extractions.use-case";
import type { CallExtractionRepository } from "../../../src/modules/extractions/application/interfaces/call-extraction-repository.interface";
import type { AgentDispositionLookupItem } from "../../../src/modules/extractions/domain/rules/dynamic-extraction-mapper.rules";

describe("MaterializeCallExtractionsUseCase (Module 11)", () => {
  let mockRepo: { [K in keyof CallExtractionRepository]: ReturnType<typeof vi.fn> };
  let useCase: MaterializeCallExtractionsUseCase;

  const sampleDispositions: AgentDispositionLookupItem[] = [
    {
      id: "disp-intent",
      slug: "purchase-intent",
      name: "Purchase Intent",
      displayName: "Purchase Readiness",
      isObjective: true,
      isSubjective: false,
      objectiveOptions: [{ value: "Ready to Buy", condition: "Ready", sortOrder: 0 }],
    },
    {
      id: "disp-feedback",
      slug: "customer-feedback",
      name: "Customer Feedback",
      displayName: "Customer Remarks",
      isObjective: false,
      isSubjective: true,
    },
  ];

  beforeEach(() => {
    mockRepo = {
      getAgentDispositionsForCall: vi.fn(),
      getCallContext: vi.fn(),
      upsertCallAnalysis: vi.fn(),
      getDispositionDisplayNames: vi.fn(),
      replaceExtractionOverview: vi.fn(),
      replaceExtractionInsights: vi.fn(),
    };

    useCase = new MaterializeCallExtractionsUseCase(mockRepo as unknown as CallExtractionRepository);
  });

  it("returns null and performs no DB actions when extractedData is null or empty object", async () => {
    const res1 = await useCase.execute({
      callId: "call-1",
      tenantId: "tenant-1",
      extractedData: null,
    });
    expect(res1).toBeNull();

    const res2 = await useCase.execute({
      callId: "call-1",
      tenantId: "tenant-1",
      extractedData: {},
    });
    expect(res2).toBeNull();

    expect(mockRepo.getAgentDispositionsForCall).not.toHaveBeenCalled();
    expect(mockRepo.upsertCallAnalysis).not.toHaveBeenCalled();
  });

  it("saves raw extraction only and returns null when call has no platformAgentId or zero assigned dispositions", async () => {
    mockRepo.getAgentDispositionsForCall.mockResolvedValue({
      platformAgentId: null,
      dispositions: [],
    });

    const rawData = { Category: { Question: { value: "Answer" } } };

    const result = await useCase.execute({
      callId: "call-1",
      tenantId: "tenant-1",
      extractedData: rawData,
    });

    expect(result).toBeNull();
    expect(mockRepo.upsertCallAnalysis).toHaveBeenCalledWith({
      callId: "call-1",
      tenantId: "tenant-1",
      extractionResult: rawData,
    });
    expect(mockRepo.replaceExtractionOverview).not.toHaveBeenCalled();
    expect(mockRepo.replaceExtractionInsights).not.toHaveBeenCalled();
  });

  it("maps dynamic extractions and materializes objective overview and subjective insights into database", async () => {
    mockRepo.getAgentDispositionsForCall.mockResolvedValue({
      platformAgentId: "agent-1",
      dispositions: sampleDispositions,
    });

    mockRepo.getCallContext.mockResolvedValue({
      campaignId: "camp-1",
      batchId: "batch-1",
    });

    const displayNameMap = new Map<string, string>([
      ["disp-intent", "Purchase Readiness Display"],
      ["disp-feedback", "Customer Remarks Display"],
    ]);
    mockRepo.getDispositionDisplayNames.mockResolvedValue(displayNameMap);

    const extractedData = {
      IntentCategory: {
        "Purchase Intent": {
          objective: "Ready to Buy",
          confidence: 0.95,
          confidence_label: "HIGH",
        },
      },
      FeedbackCategory: {
        "Customer Feedback": {
          subjective: "Loves the agent voice cadence.",
          confidence: 0.88,
          confidence_label: "HIGH",
        },
      },
    };

    const result = await useCase.execute({
      callId: "call-1",
      tenantId: "tenant-1",
      extractedData,
    });

    expect(result).toBeDefined();
    expect(result?.overviewCount).toBe(1);
    expect(result?.insightCount).toBe(1);

    // 1. Check CallAnalysis upsert
    expect(mockRepo.upsertCallAnalysis).toHaveBeenCalledWith({
      callId: "call-1",
      tenantId: "tenant-1",
      extractionResult: extractedData,
      dynamicExtractions: expect.any(Object),
    });

    // 2. Check overview replacement
    expect(mockRepo.replaceExtractionOverview).toHaveBeenCalledWith({
      callId: "call-1",
      tenantId: "tenant-1",
      campaignId: "camp-1",
      batchId: "batch-1",
      items: [
        {
          dispositionId: "disp-intent",
          dispositionSlug: "purchase-intent",
          dispositionName: "Purchase Readiness Display",
          categoryName: "IntentCategory",
          objectiveValue: "Ready to Buy",
          confidence: 0.95,
          sortOrder: 0,
        },
      ],
    });

    // 3. Check insights replacement
    expect(mockRepo.replaceExtractionInsights).toHaveBeenCalledWith({
      callId: "call-1",
      tenantId: "tenant-1",
      campaignId: "camp-1",
      batchId: "batch-1",
      items: [
        {
          dispositionId: "disp-feedback",
          dispositionSlug: "customer-feedback",
          dispositionName: "Customer Remarks Display",
          categoryName: "FeedbackCategory",
          subjectiveValue: "Loves the agent voice cadence.",
          normalizedValue: "loves the agent voice cadence.",
          confidence: 0.88,
        },
      ],
    });
  });
});
