import { GoogleGenerativeAI } from "@google/generative-ai";
import { AppError } from "../../../shared/errors";
import { HttpStatus } from "../../../shared/constants";
import type { RequiredVariable } from "../../../shared/types/bolna.types";
import type { PDFExtractionResult } from "./pdfExtractor";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DynamicExtractionResult {
  variables: Record<string, string | null>;
  confidence: number;
  warnings: string[];
}

// ─── Gemini Client ────────────────────────────────────────────────────────────
function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AppError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      "GEMINI_API_KEY is not set in environment variables",
      "GEMINI_API_KEY_NOT_CONFIGURED",
    );
  }
  return new GoogleGenerativeAI(apiKey);
}

// ─── Main Extractor ───────────────────────────────────────────────────────────
export async function extractVariablesFromDocument(
  pdfResult: PDFExtractionResult,
  variables: RequiredVariable[],
): Promise<DynamicExtractionResult> {
  if (variables.length === 0) {
    return { variables: {}, confidence: 1, warnings: [] };
  }

  if (pdfResult.textLength === 0) {
    const emptyVars: Record<string, string | null> = {};
    for (const v of variables) {
      emptyVars[v.name] = null;
    }
    return {
      variables: emptyVars,
      confidence: 0,
      warnings: ["No text content found in document."],
    };
  }

  console.info(
    `[DynamicExtractor] Extracting ${variables.length} variables from: ${pdfResult.fileName}`,
  );

  const genAI = getGeminiClient();
  const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const prompt = buildExtractionPrompt(pdfResult, variables);

  let responseText: string;

  try {
    const result = await model.generateContent(prompt);
    responseText = result.response.text();
  } catch (geminiError: unknown) {
    const error = geminiError as {
      message?: string;
      status?: number;
    };

    if (error.message?.includes("SAFETY")) {
      throw new AppError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "Content was blocked by AI safety filters. Please check the document content.",
        "LLM_MODEL_BLOCKED_DUE_TO_SAFETY",
      );
    }

    if (error.message?.includes("quota") || error.message?.includes("429")) {
      throw new AppError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "AI API quota exceeded. Please try again later.",
        "LLM_MODEL_DAILY_QUOTA_EXCEEDED",
      );
    }

    throw new AppError(
      HttpStatus.BAD_REQUEST,
      `AI extraction failed: ${error.message}`,
      "LLM_MODEL_API_ERROR",
    );
  }

  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(responseText);
  } catch {
    console.error(
      "[DynamicExtractor] AI returned invalid JSON:",
      responseText.substring(0, 500),
    );
    throw new AppError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      "AI returned invalid response. Please try again.",
      "LLM_INVALID_JSON_RESPONSE",
    );
  }

  // Normalize to Record<string, string | null>
  const extracted: Record<string, string | null> = {};
  const warnings: string[] = [];
  let foundCount = 0;

  for (const v of variables) {
    const raw = parsed[v.name];
    if (raw === null || raw === undefined || raw === "") {
      extracted[v.name] = null;
      warnings.push(`${v.label} (${v.name}) not found in document`);
    } else {
      extracted[v.name] = String(raw);
      foundCount++;
    }
  }

  const confidence =
    variables.length > 0
      ? parseFloat((foundCount / variables.length).toFixed(2))
      : 0;

  console.info(
    `[DynamicExtractor] Done. Found ${foundCount}/${variables.length} variables. Confidence: ${confidence}`,
  );

  return { variables: extracted, confidence, warnings };
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────
function buildExtractionPrompt(
  pdfResult: PDFExtractionResult,
  variables: RequiredVariable[],
): string {
  const variableLines = variables
    .map((v) => `  "${v.name}": "${v.label}"`)
    .join(",\n");

  const outputExample = variables
    .map((v) => `  "${v.name}": "extracted value or null"`)
    .join(",\n");

  return `
You are a data extraction AI. Extract the following variables from the document text.

## VARIABLES TO EXTRACT:
{
${variableLines}
}

## RULES:
1. Extract ONLY information explicitly present in the text
2. Use null for any field not found — do NOT guess or hallucinate
3. Return all values as strings (convert numbers to strings)
4. Return ONLY valid JSON — no markdown, no explanation

## OUTPUT FORMAT:
{
${outputExample}
}

## DOCUMENT TEXT:
---
${pdfResult.rawText}
---

Return ONLY the JSON object.
`.trim();
}
