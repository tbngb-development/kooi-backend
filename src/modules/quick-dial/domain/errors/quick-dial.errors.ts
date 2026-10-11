import { AppError, NotFoundError } from "../../../../shared/errors";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class InsufficientCreditsForQuickDialError extends AppError {
  constructor(message = "Insufficient wallet balance to initiate a quick dial call.") {
    super(HttpStatus.BAD_REQUEST, message, "INSUFFICIENT_CREDITS");
    this.name = "InsufficientCreditsForQuickDialError";
  }
}

export class QuickDialAssistantNotFoundError extends NotFoundError {
  constructor(assistantId: string) {
    super(
      `Assistant '${assistantId}' was not found or is not configured for voice calling.`,
    );
    this.name = "QuickDialAssistantNotFoundError";
  }
}

export class QuickDialJobNotFoundError extends NotFoundError {
  constructor(jobId: string) {
    super(`Quick dial job '${jobId}' was not found.`);
    this.name = "QuickDialJobNotFoundError";
  }
}

export class QuickDialExecutionError extends AppError {
  constructor(message: string) {
    super(HttpStatus.BAD_GATEWAY, `Quick dial execution failed: ${message}`, "QUICK_DIAL_EXECUTION_FAILED");
    this.name = "QuickDialExecutionError";
  }
}
