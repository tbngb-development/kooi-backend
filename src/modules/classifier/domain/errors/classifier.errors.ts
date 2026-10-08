import { AppError } from "../../../../shared/errors/app.error";

export class ClassifierDispositionNotFoundError extends AppError {
  constructor(identifier: string) {
    super(
      404,
      `Classifier disposition not found: ${identifier}`,
      "CLASSIFIER_DISPOSITION_NOT_FOUND",
    );
  }
}

export class ClassifierDuplicateSlugError extends AppError {
  constructor(slug: string, industryPackId: string | null) {
    super(
      409,
      `Classifier disposition with slug "${slug}" already exists for industry "${industryPackId ?? "general"}".`,
      "CLASSIFIER_DUPLICATE_SLUG",
    );
  }
}

export class ClassifierEvaluationError extends AppError {
  constructor(message: string) {
    super(
      502,
      `Classifier evaluation failed: ${message}`,
      "CLASSIFIER_EVALUATION_FAILED",
    );
  }
}

export class ClassifierTranscriptMissingError extends AppError {
  constructor(callId: string) {
    super(
      422,
      `No transcript available for call ${callId}.`,
      "CLASSIFIER_TRANSCRIPT_MISSING",
    );
  }
}

export class ClassifierConfigMissingError extends AppError {
  constructor() {
    super(
      503,
      "AI_GATEWAY_API_KEY is not configured for classifier extraction.",
      "CLASSIFIER_CONFIG_MISSING",
    );
  }
}
