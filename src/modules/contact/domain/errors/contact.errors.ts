import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class EmailDeliveryError extends AppError {
  constructor(message = "Unable to deliver your message at this time. Please try again or contact us directly.", cause?: unknown) {
    super(
      HttpStatus.BAD_GATEWAY,
      message,
      "EMAIL_DELIVERY_FAILED",
      true,
      cause,
    );
  }
}

export class SpamDetectedError extends AppError {
  constructor(message = "Submission rejected as spam.") {
    super(
      HttpStatus.BAD_REQUEST,
      message,
      "SPAM_DETECTED",
      true,
    );
  }
}

export class InvalidContactFormError extends AppError {
  constructor(message: string) {
    super(
      HttpStatus.BAD_REQUEST,
      message,
      "INVALID_CONTACT_FORM",
      true,
    );
  }
}
