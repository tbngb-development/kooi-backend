import {
  extractTextFromPDF,
  assessTextQuality,
} from "../../infrastructure/pdfExtractor";
import { extractVariablesFromDocument } from "../../infrastructure/dynamicVariableExtractor";
import { cleanupUploadedFile } from "../../../../shared/middleware/upload";
import { AppError } from "../../../../shared/errors";
import { HttpStatus } from "../../../../shared/constants";
import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import type {
  ExtractVariablesInput,
  ExtractVariablesOutput,
} from "../dto/campaign.dto";

export class ExtractCampaignVariablesUseCase {
  constructor(private readonly campaignRepo: CampaignRepository) {}

  async execute(
    tenantId: string,
    input: ExtractVariablesInput,
  ): Promise<ExtractVariablesOutput> {
    // 1. Validate assistant belongs to tenant and fetch required variables
    const assistant = await this.campaignRepo.findAssistantWithAgent(
      tenantId,
      input.assistantId,
    );

    if (!assistant) {
      throw new AppError(
        HttpStatus.NOT_FOUND,
        "Assistant not found or does not belong to this tenant",
        "ASSISTANT_NOT_FOUND",
      );
    }

    // 2. Filter to only required + editable variables
    const allVariables = assistant.platformAgent.requiredVariables ?? [];
    const extractableVariables = allVariables.filter(
      (v) => v.required && v.isEditable,
    );

    // 3. If nothing to extract, return early
    if (extractableVariables.length === 0) {
      cleanupUploadedFile(input.filePath);
      return {
        variables: {},
        confidence: 1,
        warnings: [
          "No editable required variables configured for this assistant.",
        ],
        pdfMeta: {
          fileName: input.originalFileName,
          pageCount: 0,
          textLength: 0,
          truncated: false,
        },
      };
    }

    try {
      // 4. Extract text from PDF
      const pdfResult = await extractTextFromPDF(
        input.filePath,
        input.originalFileName,
      );

      const textQuality = assessTextQuality(pdfResult);

      if (!textQuality.hasUsableText && pdfResult.textLength === 0) {
        throw new AppError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "No text content could be extracted from the PDF.",
          "UNPROCESSABLE_PDF",
        );
      }

      // 5. Run dynamic variable extraction
      const extraction = await extractVariablesFromDocument(
        pdfResult,
        extractableVariables,
      );

      return {
        variables: extraction.variables,
        confidence: extraction.confidence,
        warnings: [
          ...extraction.warnings,
          ...(textQuality.warning ? [textQuality.warning] : []),
        ],
        pdfMeta: {
          fileName: pdfResult.fileName,
          pageCount: pdfResult.pageCount,
          textLength: pdfResult.textLength,
          truncated: pdfResult.truncated,
        },
      };
    } catch (error: unknown) {
      const err = error as { message?: string };
      if (err.message?.includes("quota") || err.message?.includes("QUOTA")) {
        throw new AppError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "AI API quota exceeded. Please try again later.",
          "LLM_MODEL_DAILY_QUOTA_EXCEEDED",
        );
      }
      throw error;
    } finally {
      cleanupUploadedFile(input.filePath);
    }
  }
}
