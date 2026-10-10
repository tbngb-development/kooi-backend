import prisma from "../../../../shared/config/database/prisma";
import { AppError } from "../../../../shared/errors";
import { HttpStatus } from "../../../../shared/constants";
import { PlatformAgentNotFoundError } from "../../domain/errors/platform-agent.errors";
import type {
  TestAgentExtractionInput,
  TestAgentExtractionOutput,
} from "../dto/test-extraction.dto";
import type {
  ExtractionLlmProvider,
  ExtractionCategoryTaxonomy,
} from "../../infrastructure/services/extraction-llm.provider";

export class TestPlatformAgentExtractionsUseCase {
  constructor(private readonly llmProvider: ExtractionLlmProvider) {}

  async execute(
    input: TestAgentExtractionInput,
  ): Promise<TestAgentExtractionOutput> {
    const { platformAgentId, callId, customTranscript, dispositionIds } = input;

    // 1. Verify Platform Agent exists
    const agent = await prisma.platformAgent.findUnique({
      where: { id: platformAgentId },
      select: {
        id: true,
        name: true,
        categories: {
          orderBy: { sortOrder: "asc" },
          select: {
            category: {
              select: {
                id: true,
                name: true,
                slug: true,
                model: true,
                dispositions: {
                  orderBy: { sortOrder: "asc" },
                  select: {
                    disposition: {
                      select: {
                        id: true,
                        name: true,
                        displayName: true,
                        question: true,
                        systemPrompt: true,
                        model: true,
                        isObjective: true,
                        isSubjective: true,
                        subjectiveType: true,
                        objectiveOptions: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!agent) {
      throw new PlatformAgentNotFoundError(platformAgentId);
    }

    // 2. Resolve Transcript & Call Info
    let transcriptText: string;
    let callInfo: TestAgentExtractionOutput["callInfo"] = undefined;
    let resolvedCallId: string | null = null;

    if (callId) {
      const call = await prisma.call.findUnique({
        where: { id: callId },
        select: {
          id: true,
          status: true,
          transcript: true,
          duration: true,
          lead: {
            select: {
              phone: true,
              name: true,
            },
          },
          campaign: {
            select: {
              name: true,
            },
          },
          tenant: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!call) {
        throw new AppError(
          HttpStatus.NOT_FOUND,
          `Call record with ID "${callId}" was not found.`,
          "CALL_NOT_FOUND",
        );
      }

      if (call.status !== "COMPLETED") {
        throw new AppError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          `Selected call is in status "${call.status}". Only calls with status "COMPLETED" can be tested.`,
          "CALL_NOT_COMPLETED",
        );
      }

      if (!call.transcript || call.transcript.trim().length === 0) {
        throw new AppError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          `Selected call "${callId}" does not contain a transcript.`,
          "CALL_TRANSCRIPT_EMPTY",
        );
      }

      transcriptText = call.transcript.trim();
      resolvedCallId = call.id;
      callInfo = {
        leadPhone: call.lead?.phone,
        leadName: call.lead?.name,
        campaignName: call.campaign?.name,
        tenantName: call.tenant?.name,
        duration: call.duration,
      };
    } else if (customTranscript && customTranscript.trim().length > 0) {
      transcriptText = customTranscript.trim();
    } else {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        "Either a valid completed callId or a custom transcript must be provided.",
        "TRANSCRIPT_REQUIRED",
      );
    }

    // 3. Build & Filter Category / Disposition Taxonomy
    const targetFilterIds =
      dispositionIds && dispositionIds.length > 0
        ? new Set(dispositionIds)
        : null;

    const taxonomy: ExtractionCategoryTaxonomy[] = [];
    let totalDispositionsCount = 0;

    for (const catLink of agent.categories) {
      const category = catLink.category;
      const matchedDispositions = category.dispositions
        .map((d) => d.disposition)
        .filter((d) => {
          if (!targetFilterIds) return true;
          return targetFilterIds.has(d.id);
        });

      if (matchedDispositions.length > 0) {
        totalDispositionsCount += matchedDispositions.length;
        taxonomy.push({
          categoryName: category.name,
          model: category.model,
          dispositions: matchedDispositions.map((d) => ({
            name: d.name,
            displayName: d.displayName,
            question: d.question,
            systemPrompt: d.systemPrompt,
            isObjective: d.isObjective,
            isSubjective: d.isSubjective,
            subjectiveType: d.subjectiveType,
            objectiveOptions: Array.isArray(d.objectiveOptions)
              ? (d.objectiveOptions as any[])
              : null,
          })),
        });
      }
    }

    if (taxonomy.length === 0 || totalDispositionsCount === 0) {
      throw new AppError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        targetFilterIds
          ? "None of the specified disposition IDs are assigned to this platform agent."
          : "This platform agent does not have any extraction categories or dispositions assigned yet. Please assign categories before running tests.",
        "NO_DISPOSITIONS_CONFIGURED",
      );
    }

    // 4. Generate structured extractions via LLM
    const llmResult = await this.llmProvider.generateExtraction({
      transcript: transcriptText,
      categories: taxonomy,
      provider: input.provider,
      model: input.model,
      apiKey: input.apiKey,
    });

    return {
      callId: resolvedCallId,
      callInfo,
      transcript: transcriptText,
      extracted_data: llmResult.extracted_data,
      usage: {
        ...llmResult.usage,
        categoriesEvaluated: taxonomy.length,
        dispositionsEvaluated: totalDispositionsCount,
      },
    };
  }
}
