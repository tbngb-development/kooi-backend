import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class WebhookResolutionError extends AppError {
  constructor(message: string) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      `Webhook resolution failed: ${message}`,
      "WEBHOOK_RESOLUTION_FAILED",
    );
  }
}
