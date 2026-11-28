import { describe, it, expect, vi, beforeEach } from "vitest";

const { generateContent } = vi.hoisted(() => ({
  generateContent: vi.fn(),
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent };
    }
  },
}));

import { extractVariablesFromDocument } from "../dynamicVariableExtractor";
import type { PDFExtractionResult } from "../pdfExtractor";
import type { RequiredVariable } from "../../../../shared/types/bolna.types";

describe("extractVariablesFromDocument — select options in prompt", () => {
  const pdfResult: PDFExtractionResult = {
    rawText: "Project offers 1 BHK, 2 BHK and 3 BHK homes.",
    pageCount: 1,
    textLength: 44,
    fileSizeBytes: 100,
    fileSizeMB: "0.00",
    fileName: "brochure.pdf",
    extractedAt: "2026-01-01T00:00:00.000Z",
    truncated: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-key";
    generateContent.mockResolvedValue({
      response: { text: () => JSON.stringify({ bhk_type: "2 BHK" }) },
    });
  });

  it("includes configured select options in the Gemini prompt", async () => {
    const variables: RequiredVariable[] = [
      {
        name: "bhk_type",
        label: "BHK Type",
        required: true,
        isEditable: true,
        inputType: "select",
        options: ["1 BHK", "2 BHK", "3 BHK"],
        defaultValue: null,
      },
    ];

    const result = await extractVariablesFromDocument(pdfResult, variables);

    expect(result.variables).toEqual({ bhk_type: "2 BHK" });
    const prompt = String(generateContent.mock.calls[0]?.[0]);
    expect(prompt).toContain("bhk_type");
    expect(prompt).toContain("1 BHK");
    expect(prompt).toContain("2 BHK");
    expect(prompt).toContain("3 BHK");
    expect(prompt.toLowerCase()).toContain("option");
  });
});
