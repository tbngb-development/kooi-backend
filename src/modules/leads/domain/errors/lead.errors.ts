import { NotFoundError } from "../../../../shared/errors/not-found.error";
import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class LeadNotFoundError extends NotFoundError {
  constructor() {
    super("Lead");
  }
}

export class MissingRequiredHeaderError extends AppError {
  public readonly detectedHeaders: string[];

  constructor(detectedHeaders: string[]) {
    const message = `Missing required header 'contact_number'. Detected headers: [${detectedHeaders.join(", ")}]. Please download the template and use the correct column names.`;

    super(HttpStatus.BAD_REQUEST, message, "MISSING_REQUIRED_HEADER");
    this.detectedHeaders = detectedHeaders;
  }
}
