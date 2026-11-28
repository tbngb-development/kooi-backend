import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExtractCampaignVariablesUseCase } from "../application/use-cases/extract-campaign-variables.use-case";
import type { CampaignRepository } from "../application/interfaces/campaign-repository.interface";
import { extractVariablesFromDocument } from "../infrastructure/dynamicVariableExtractor";

vi.mock("../infrastructure/pdfExtractor", () => ({
  extractTextFromPDF: vi.fn().mockResolvedValue({
    rawText: "Brochure text",
    pageCount: 1,
    textLength: 13,
    fileSizeBytes: 100,
    fileSizeMB: "0.00",
    fileName: "brochure.pdf",
    extractedAt: "2026-01-01T00:00:00.000Z",
    truncated: false,
  }),
  assessTextQuality: vi.fn().mockReturnValue({ hasUsableText: true }),
}));

vi.mock("../infrastructure/dynamicVariableExtractor", () => ({
  extractVariablesFromDocument: vi
    .fn()
    .mockResolvedValue({ variables: {}, confidence: 1, warnings: [] }),
}));

describe("ExtractCampaignVariablesUseCase — select variables", () => {
  let repository: CampaignRepository;
  let useCase: ExtractCampaignVariablesUseCase;

  const input = {
    assistantId: "assistant-id",
    filePath: "does-not-exist.pdf",
    originalFileName: "brochure.pdf",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repository = {
      findAssistantWithAgent: vi.fn().mockResolvedValue(null),
      findSarvamAgentWithApiKey: vi.fn().mockResolvedValue(null),
    } as unknown as CampaignRepository;
    useCase = new ExtractCampaignVariablesUseCase(repository);
  });

  it("passes PlatformAgent select variables with options through to the extractor", async () => {
    const selectVariable = {
      name: "bhk_type",
      label: "BHK Type",
      required: true,
      isEditable: true,
      inputType: "select",
      options: ["1 BHK", "2 BHK"],
      defaultValue: null,
    };

    vi.mocked(repository.findAssistantWithAgent).mockResolvedValue({
      id: "assistant-id",
      name: "Assistant",
      platformAgent: {
        id: "agent-id",
        bolnaId: "bolna-id",
        requiredVariables: [selectVariable],
      },
    } as never);

    await useCase.execute("tenant-id", input);

    expect(extractVariablesFromDocument).toHaveBeenCalledWith(
      expect.anything(),
      [selectVariable],
    );
  });

  it("preserves select inputType and options for Sarvam variables", async () => {
    vi.mocked(repository.findSarvamAgentWithApiKey).mockResolvedValue({
      id: "sarvam-agent-id",
      name: "Sarvam Agent",
      appId: "app",
      appVersion: 1,
      attemptsPerSecond: null,
      agentVariables: [
        {
          key: "bhk_type",
          dataType: "string",
          inputType: "select",
          options: ["1 BHK", "2 BHK"],
          required: true,
          defaultValue: "1 BHK",
          isTenantVisible: true,
          isTenantEditable: true,
        },
      ],
      connectionConfigs: [],
      retryConfig: null,
      allowTenantVisible: true,
    } as never);

    await useCase.execute("tenant-id", input);

    expect(extractVariablesFromDocument).toHaveBeenCalledWith(
      expect.anything(),
      [
        expect.objectContaining({
          name: "bhk_type",
          inputType: "select",
          options: ["1 BHK", "2 BHK"],
        }),
      ],
    );
  });
});
