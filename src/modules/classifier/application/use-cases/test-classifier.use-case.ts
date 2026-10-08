import type { ClassifierRepository } from "../interfaces/classifier-repository.interface";
import type { ClassifierProvider } from "../interfaces/classifier-provider.interface";
import type {
  TestClassifierDTO,
  TestClassifierResult,
  ClassifierAnswerResult,
  JevQuestionDef,
  ObjectiveOption,
} from "../dto/classifier.dto";
import {
  ClassifierDispositionNotFoundError,
  ClassifierTranscriptMissingError,
} from "../../domain/errors/classifier.errors";
import { NotFoundError } from "../../../../shared/errors/not-found.error";
import { ValidationError } from "../../../../shared/errors/validation.error";
import { env } from "../../../../shared/config/env";
import type { ClassifierDisposition } from "@prisma/client";

export class TestClassifierUseCase {
  constructor(
    private readonly repo: ClassifierRepository,
    private readonly provider: ClassifierProvider,
  ) {}

  async execute(data: TestClassifierDTO): Promise<TestClassifierResult> {
    if (data.classifierDispositionIds.length === 0) {
      throw new ValidationError([
        {
          field: "classifierDispositionIds",
          message: "At least one classifier disposition must be selected.",
        },
      ]);
    }

    // 1. Fetch dispositions
    const dispositions: ClassifierDisposition[] = [];
    for (const id of data.classifierDispositionIds) {
      const d = await this.repo.getDispositionById(id);
      if (!d) throw new ClassifierDispositionNotFoundError(id);
      dispositions.push(d);
    }

    // 2. Get transcript
    let transcript: string;

    if (data.transcriptSource === "existing") {
      if (!data.callId) {
        throw new ValidationError([
          {
            field: "callId",
            message: "callId is required when transcriptSource is 'existing'.",
          },
        ]);
      }

      const callData = await this.repo.getCallTranscript(data.callId);
      if (!callData) throw new NotFoundError("Call not found.");
      if (!callData.transcript?.trim()) {
        throw new ClassifierTranscriptMissingError(data.callId);
      }
      transcript = callData.transcript.trim();
    } else {
      if (!data.customTranscript?.trim()) {
        throw new ValidationError([
          {
            field: "customTranscript",
            message:
              "customTranscript is required when transcriptSource is 'custom'.",
          },
        ]);
      }
      transcript = data.customTranscript.trim();
    }

    // 3. Truncate
    const maxLen = env.classifier.maxTranscriptLength;
    const state =
      transcript.length > maxLen ? transcript.slice(0, maxLen) : transcript;

    // 4. Build questions
    const questions = this.buildQuestions(dispositions);

    // 5. Evaluate
    const evaluation = await this.provider.evaluate({ state, questions });

    // 6. Parse
    const results = this.parseAnswers(evaluation.answers, dispositions);

    return {
      results,
      usage: {
        inputTokens: evaluation.inputTokens,
        outputTokens: evaluation.outputTokens,
        gatewayCost: evaluation.gatewayCost,
      },
    };
  }

  private buildQuestions(
    dispositions: ClassifierDisposition[],
  ): Record<string, JevQuestionDef> {
    const questions: Record<string, JevQuestionDef> = {};

    for (const d of dispositions) {
      const key = d.slug.replace(/-/g, "_");
      const options = d.objectiveOptions as unknown as ObjectiveOption[];

      switch (d.questionType) {
        case "BOOLEAN":
          questions[key] = {
            type: "noul",
            instructions: `${d.question} ${options[0].condition}`,
          };
          break;
        case "CHOICE": {
          const criteria: Record<string, string> = {};
          for (const opt of options) criteria[opt.value] = opt.condition;
          questions[key] = {
            type: "choice",
            instructions: d.question,
            criteria,
          };
          break;
        }
        case "MULTI_CHOICE":
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

    return questions;
  }

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
          const a = answers[key];
          if (!a || a.type !== "noul") {
            results[d.slug] = {
              value: null,
              confidence: null,
              questionType: "BOOLEAN",
              classifierDispositionId: d.id,
            };
            break;
          }
          results[d.slug] = {
            value: a.noul >= 0.5 ? options[0].value : null,
            confidence: a.noul >= 0.5 ? a.noul : 1 - a.noul,
            questionType: "BOOLEAN",
            classifierDispositionId: d.id,
          };
          break;
        }
        case "CHOICE": {
          const a = answers[key];
          results[d.slug] = {
            value: a?.choice ?? null,
            confidence: a?.confidence ?? 0,
            questionType: "CHOICE",
            classifierDispositionId: d.id,
          };
          break;
        }
        case "MULTI_CHOICE": {
          const selected: string[] = [];
          const conf: Record<string, number> = {};
          for (const opt of options) {
            const subKey = `${key}__${opt.value.toLowerCase().replace(/\s+/g, "_")}`;
            const a = answers[subKey];
            if (a?.type === "noul" && a.noul >= 0.5) {
              selected.push(opt.value);
              conf[opt.value] = a.noul;
            }
          }
          results[d.slug] = {
            value: selected.length > 0 ? selected : null,
            confidence: selected.length > 0 ? conf : null,
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
