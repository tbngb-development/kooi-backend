import type { ClassifierRepository } from "../interfaces/classifier-repository.interface";
import type { ClassifierProvider } from "../interfaces/classifier-provider.interface";
import type {
  ClassifierAnswerResult,
  JevQuestionDef,
  ObjectiveOption,
} from "../dto/classifier.dto";
import type { ClassifierDisposition } from "@prisma/client";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { env } from "../../../../shared/config/env";

export class ProcessClassifierExtractionUseCase {
  constructor(
    private readonly repo: ClassifierRepository,
    private readonly provider: ClassifierProvider,
    private readonly logger?: Logger,
  ) {}

  async execute(callId: string, tenantId: string): Promise<void> {
    // 1. Fetch call data + agent resolution chain
    const callData = await this.repo.getCallTranscript(callId);

    if (!callData) {
      this.logger?.warn("Call not found for classifier extraction", {
        action: "classifier.call_not_found",
        callId,
      });
      return;
    }

    // 2. Check transcript
    const transcript = callData.transcript?.trim();
    if (!transcript) {
      await this.repo.createCallResult({
        callId,
        tenantId,
        campaignId: callData.campaignId,
        batchId: callData.batchId,
        dispositionCount: 0,
        transcriptLength: 0,
      });
      await this.repo.updateCallResult(callId, {
        status: "SKIPPED",
        errorMessage: "No transcript available",
        processedAt: new Date(),
      });
      return;
    }

    // 3. Check agent
    if (!callData.platformAgentId) {
      await this.repo.createCallResult({
        callId,
        tenantId,
        campaignId: callData.campaignId,
        batchId: callData.batchId,
        dispositionCount: 0,
        transcriptLength: transcript.length,
      });
      await this.repo.updateCallResult(callId, {
        status: "SKIPPED",
        errorMessage: "No platform agent linked to call",
        processedAt: new Date(),
      });
      return;
    }

    // 4. Resolve classifier dispositions (industry-aware)
    const dispositions = await this.repo.resolveForAgent(
      callData.platformAgentId,
      callData.industryPackId,
    );

    if (dispositions.length === 0) {
      await this.repo.createCallResult({
        callId,
        tenantId,
        campaignId: callData.campaignId,
        batchId: callData.batchId,
        dispositionCount: 0,
        transcriptLength: transcript.length,
      });
      await this.repo.updateCallResult(callId, {
        status: "SKIPPED",
        errorMessage: "No classifier dispositions configured for agent",
        processedAt: new Date(),
      });
      return;
    }

    // 5. Create pending result record
    await this.repo.createCallResult({
      callId,
      tenantId,
      campaignId: callData.campaignId,
      batchId: callData.batchId,
      dispositionCount: dispositions.length,
      transcriptLength: transcript.length,
    });

    await this.repo.updateCallResult(callId, { status: "PROCESSING" });

    try {
      // 6. Build JEV questions
      const questions = this.buildQuestions(dispositions);

      // 7. Truncate transcript if needed
      const maxLen = env.classifier.maxTranscriptLength;
      const state =
        transcript.length > maxLen ? transcript.slice(0, maxLen) : transcript;

      if (transcript.length > maxLen) {
        this.logger?.warn("Transcript truncated for classifier", {
          action: "classifier.transcript_truncated",
          callId,
          originalLength: transcript.length,
          truncatedLength: maxLen,
        });
      }

      // 8. Call JEV
      const evaluation = await this.provider.evaluate({ state, questions });

      // 9. Parse answers
      const results = this.parseAnswers(evaluation.answers, dispositions);

      // 10. Store results
      await this.repo.updateCallResult(callId, {
        status: "COMPLETED",
        rawResponse: evaluation.rawResponse,
        results,
        inputTokens: evaluation.inputTokens,
        outputTokens: evaluation.outputTokens,
        gatewayCost: evaluation.gatewayCost ?? undefined,
        processedAt: new Date(),
      });

      this.logger?.info("Classifier extraction completed", {
        action: "classifier.completed",
        callId,
        tenantId,
        dispositionCount: dispositions.length,
        inputTokens: evaluation.inputTokens,
        outputTokens: evaluation.outputTokens,
        gatewayCost: evaluation.gatewayCost,
      });
    } catch (err: any) {
      const message = err?.message ?? String(err);

      await this.repo.updateCallResult(callId, {
        status: "FAILED",
        errorMessage: message,
        processedAt: new Date(),
      });

      this.logger?.error("Classifier extraction failed", err, {
        action: "classifier.failed",
        callId,
        tenantId,
        error: message,
      });

      throw err; // Re-throw for Bull retry
    }
  }

  // ── Question Builder ────────────────────────────────────────────────────

  private buildQuestions(
    dispositions: ClassifierDisposition[],
  ): Record<string, JevQuestionDef> {
    const questions: Record<string, JevQuestionDef> = {};

    for (const d of dispositions) {
      const key = d.slug.replace(/-/g, "_");
      const options = d.objectiveOptions as unknown as ObjectiveOption[];

      switch (d.questionType) {
        case "BOOLEAN": {
          const positive = options[0];
          questions[key] = {
            type: "noul",
            instructions: `${d.question} ${positive.condition}`,
          };
          break;
        }

        case "CHOICE": {
          const criteria: Record<string, string> = {};
          for (const opt of options) {
            criteria[opt.value] = opt.condition;
          }
          questions[key] = {
            type: "choice",
            instructions: d.question,
            criteria,
          };
          break;
        }

        case "MULTI_CHOICE": {
          for (const opt of options) {
            const subKey = `${key}__${opt.value.toLowerCase().replace(/\s+/g, "_")}`;
            questions[subKey] = {
              type: "noul",
              instructions: `${d.question} Specifically: ${opt.condition}`,
            };
          }
          break;
        }
      }
    }

    return questions;
  }

  // ── Response Parser ─────────────────────────────────────────────────────

  private parseAnswers(
    answers: Record<string, any>,
    dispositions: ClassifierDisposition[],
  ): Record<string, ClassifierAnswerResult> {
    const results: Record<string, ClassifierAnswerResult> = {};

    for (const d of dispositions) {
      const key = d.slug.replace(/-/g, "_");
      const options = d.objectiveOptions as unknown as ObjectiveOption[];

      switch (d.questionType) {
        case "BOOLEAN": {
          const answer = answers[key];
          if (!answer || answer.type !== "noul") {
            results[d.slug] = {
              value: null,
              confidence: null,
              questionType: "BOOLEAN",
              classifierDispositionId: d.id,
            };
            break;
          }
          const noul = answer.noul as number;
          results[d.slug] = {
            value: noul >= 0.5 ? options[0].value : null,
            confidence: noul >= 0.5 ? noul : 1 - noul,
            questionType: "BOOLEAN",
            classifierDispositionId: d.id,
          };
          break;
        }

        case "CHOICE": {
          const answer = answers[key];
          if (!answer || answer.type !== "choice") {
            results[d.slug] = {
              value: null,
              confidence: null,
              questionType: "CHOICE",
              classifierDispositionId: d.id,
            };
            break;
          }
          results[d.slug] = {
            value: answer.choice as string,
            confidence: (answer.confidence as number) ?? 0,
            questionType: "CHOICE",
            classifierDispositionId: d.id,
          };
          break;
        }

        case "MULTI_CHOICE": {
          const selected: string[] = [];
          const confidences: Record<string, number> = {};

          for (const opt of options) {
            const subKey = `${key}__${opt.value.toLowerCase().replace(/\s+/g, "_")}`;
            const answer = answers[subKey];

            if (answer && answer.type === "noul" && answer.noul >= 0.5) {
              selected.push(opt.value);
              confidences[opt.value] = answer.noul;
            }
          }

          results[d.slug] = {
            value: selected.length > 0 ? selected : null,
            confidence: selected.length > 0 ? confidences : null,
            questionType: "MULTI_CHOICE",
            classifierDispositionId: d.id,
          };
          break;
        }
      }
    }

    return results;
  }
}
