import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

export type RecordingRetrievalStatus =
  | "NOT_REQUESTED"
  | "PENDING"
  | "PROCESSING"
  | "AVAILABLE"
  | "FAILED";

export class SarvamRecordingNotFoundError extends AppError {
  constructor(interactionId: string, message?: string) {
    super(
      HttpStatus.NOT_FOUND,
      message ?? `Sarvam call recording not found or not yet ready for interaction '${interactionId}'.`,
      "SARVAM_RECORDING_NOT_FOUND",
    );
  }
}

export class SarvamRecordingRateLimitError extends AppError {
  public readonly retryAfterSeconds?: number;

  constructor(retryAfterSeconds?: number, message?: string) {
    super(
      HttpStatus.TOO_MANY_REQUESTS,
      message ?? "Sarvam recording API rate limit exceeded.",
      "SARVAM_RECORDING_RATE_LIMIT",
    );
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class SarvamRecordingPermanentError extends AppError {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string, code = "SARVAM_RECORDING_PERMANENT_ERROR") {
    super(
      statusCode >= 400 && statusCode < 500 ? statusCode : HttpStatus.BAD_REQUEST,
      message,
      code,
    );
    this.statusCode = statusCode;
  }
}

export class SarvamRecordingIneligibleError extends AppError {
  constructor(message: string) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      message,
      "SARVAM_RECORDING_INELIGIBLE",
    );
  }
}
