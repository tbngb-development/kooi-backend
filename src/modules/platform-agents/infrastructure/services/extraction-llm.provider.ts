import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import { AppError } from "../../../../shared/errors";
import { HttpStatus } from "../../../../shared/constants";
import type {
  TestExtractionDispositionResult,
} from "../../application/dto/test-extraction.dto";

export interface ExtractionTaxonomyItem {
  name: string;
  displayName: string;
  question: string;
  systemPrompt: string | null;
  isObjective: boolean;
  isSubjective: boolean;
  subjectiveType: string;
  objectiveOptions: Array<{
    value: string;
    condition: string;
    description?: string;
  }> | null;
}

export interface ExtractionCategoryTaxonomy {
  categoryName: string;
  model?: string;
  dispositions: ExtractionTaxonomyItem[];
}

export interface GenerateExtractionParams {
  transcript: string;
  categories: ExtractionCategoryTaxonomy[];
  provider?: "gemini" | "openai";
  model?: string;
  apiKey?: string;
}

export interface GenerateExtractionResponse {
  extracted_data: Record<string, Record<string, TestExtractionDispositionResult>>;
  usage: {
    provider: "gemini" | "openai";
    model: string;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
  };
}

export class ExtractionLlmProvider {
  async generateExtraction(
    params: GenerateExtractionParams,
  ): Promise<GenerateExtractionResponse> {
    const provider = params.provider ?? "gemini";
    const startTime = Date.now();

    const prompt = this.buildPrompt(params.transcript, params.categories);

    let rawJsonText: string;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let resolvedModel: string;

    if (provider === "gemini") {
      const apiKey = params.apiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new AppError(
          HttpStatus.BAD_REQUEST,
          "GEMINI_API_KEY is not configured in environment or request.",
          "GEMINI_API_KEY_NOT_CONFIGURED",
        );
      }

      resolvedModel =
        params.model || process.env.GEMINI_MODEL || "gemini-2.5-flash";

      const genAI = new GoogleGenerativeAI(apiKey);
      const generativeModel = genAI.getGenerativeModel({
        model: resolvedModel,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const result = await generativeModel.generateContent(prompt);
      rawJsonText = result.response.text();

      const usageMetadata = result.response.usageMetadata;
      inputTokens = usageMetadata?.promptTokenCount;
      outputTokens = usageMetadata?.candidatesTokenCount;
    } else {
      // OpenAI provider
      const apiKey = params.apiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new AppError(
          HttpStatus.BAD_REQUEST,
          "OPENAI_API_KEY is not configured in environment or request. Please provide an API key.",
          "OPENAI_API_KEY_NOT_CONFIGURED",
        );
      }

      resolvedModel = params.model || "gpt-4o-mini";

      const openAiRes = await axios.post<{
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      }>(
        "https://api.openai.com/v1/chat/completions",
        {
          model: resolvedModel,
          messages: [
            {
              role: "system",
              content:
                "You are an expert AI telephonic conversation analyst. You strictly output valid JSON adhering to the specified schema.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 90000,
        },
      );

      rawJsonText = openAiRes.data.choices[0]?.message?.content ?? "{}";
      inputTokens = openAiRes.data.usage?.prompt_tokens;
      outputTokens = openAiRes.data.usage?.completion_tokens;
    }

    const latencyMs = Date.now() - startTime;
    const extractedData = this.parseAndNormalizeResult(
      rawJsonText,
      params.categories,
    );

    return {
      extracted_data: extractedData,
      usage: {
        provider,
        model: resolvedModel,
        latencyMs,
        inputTokens,
        outputTokens,
      },
    };
  }

  private buildPrompt(
    transcript: string,
    categories: ExtractionCategoryTaxonomy[],
  ): string {
    const formattedCategories = categories.map((cat) => ({
      category: cat.categoryName,
      fields: cat.dispositions.map((d) => ({
        key: d.name,
        displayName: d.displayName,
        question: d.question,
        systemPrompt: d.systemPrompt || undefined,
        isObjective: d.isObjective,
        isSubjective: d.isSubjective,
        subjectiveType: d.subjectiveType,
        objectiveOptions: d.isObjective && d.objectiveOptions
          ? d.objectiveOptions.map((o) => ({
              option: o.value,
              criteria: o.condition,
            }))
          : undefined,
      })),
    }));

    return `You are a high-precision voice call analytics engine. Your task is to analyze the conversation transcript of a completed phone call and extract structured post-call data according to the provided categories and fields.

=== CONVERSATION TRANSCRIPT ===
${transcript.trim()}
===============================

=== EVALUATION TAXONOMY ===
${JSON.stringify(formattedCategories, null, 2)}
===========================

=== EXTRACTION RULES ===
1. Analyze the transcript factually and objectively.
2. For each category and field specified in the taxonomy, extract:
   - "subjective":
     - If the field is subjective (isSubjective = true): Provide a concise factual extract or summary from the dialogue. If no information is mentioned in the call, state clearly that it was not discussed (e.g. "No budget was stated." or "The conversation did not reach this topic.").
     - If the field is NOT subjective (isSubjective = false): MUST be null.
   - "objective":
     - If the field is objective (isObjective = true): MUST select exactly one option value from the allowed "objectiveOptions" list based on the criteria. If there is no mention or insufficient dialogue, choose the designated "NO_DATA", "UNCLEAR", or default fallback option.
     - If the field is NOT objective (isObjective = false): MUST be null.
   - "confidence": Float between 0.0 and 1.0 representing your certainty based on transcript evidence.
   - "confidence_label": "High" if confidence >= 0.8, "Medium" if confidence is between 0.5 and 0.79, or "Low" if confidence < 0.5.
   - "reasoning_subjective": Brief 1-2 sentence rationale citing dialogue evidence for the subjective evaluation, or null if isSubjective = false.
   - "reasoning_objective": Brief 1-2 sentence rationale explaining why the chosen objective option fits the conversation, or null if isObjective = false.
   - "validation": null (reserved for syntax validation).

3. Return ONLY a valid JSON object matching this EXACT format:
{
  "extracted_data": {
    "<Category Name>": {
      "<field_key>": {
        "subjective": string | null,
        "objective": string | null,
        "confidence": number,
        "confidence_label": "High" | "Medium" | "Low",
        "reasoning_subjective": string | null,
        "reasoning_objective": string | null,
        "validation": null
      }
    }
  }
}
`;
  }

  private parseAndNormalizeResult(
    rawText: string,
    categories: ExtractionCategoryTaxonomy[],
  ): Record<string, Record<string, TestExtractionDispositionResult>> {
    let cleanText = rawText.trim();
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    } else if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    let parsed: any;
    try {
      parsed = JSON.parse(cleanText);
    } catch {
      parsed = {};
    }

    const rawExtracted: Record<string, Record<string, any>> =
      parsed?.extracted_data || parsed || {};

    const normalized: Record<
      string,
      Record<string, TestExtractionDispositionResult>
    > = {};

    for (const cat of categories) {
      normalized[cat.categoryName] = {};

      // Match category by exact name, trimmed or case-insensitive
      const rawCatObj =
        rawExtracted[cat.categoryName] ||
        rawExtracted[cat.categoryName.toLowerCase()] ||
        {};

      for (const disp of cat.dispositions) {
        const rawDisp =
          rawCatObj[disp.name] ||
          rawCatObj[disp.name.toLowerCase()] ||
          rawCatObj[disp.displayName] ||
          null;

        const confidence =
          typeof rawDisp?.confidence === "number"
            ? Math.max(0, Math.min(1, rawDisp.confidence))
            : disp.isObjective || disp.isSubjective
              ? 0.5
              : 0;

        let confidenceLabel: "High" | "Medium" | "Low" = "Medium";
        if (confidence >= 0.8) confidenceLabel = "High";
        else if (confidence < 0.5) confidenceLabel = "Low";

        normalized[cat.categoryName][disp.name] = {
          subjective:
            disp.isSubjective && rawDisp?.subjective != null
              ? String(rawDisp.subjective)
              : null,
          objective:
            disp.isObjective && rawDisp?.objective != null
              ? String(rawDisp.objective)
              : null,
          confidence,
          confidence_label:
            rawDisp?.confidence_label === "High" ||
            rawDisp?.confidence_label === "Medium" ||
            rawDisp?.confidence_label === "Low"
              ? rawDisp.confidence_label
              : confidenceLabel,
          reasoning_subjective:
            disp.isSubjective && rawDisp?.reasoning_subjective != null
              ? String(rawDisp.reasoning_subjective)
              : null,
          reasoning_objective:
            disp.isObjective && rawDisp?.reasoning_objective != null
              ? String(rawDisp.reasoning_objective)
              : null,
          validation: null,
        };
      }
    }

    return normalized;
  }
}
