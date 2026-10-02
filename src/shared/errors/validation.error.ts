import { AppError } from "./app.error";
import { HttpStatus } from "../constants/http-status";

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export class ValidationError extends AppError {
  public readonly details: ValidationErrorDetail[];

  constructor(details: ValidationErrorDetail[]) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Validation failed",
      "VALIDATION_ERROR",
    );
    this.details = details;
  }
}
