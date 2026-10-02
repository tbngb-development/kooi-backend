import { AppError } from "./app.error";
import { HttpStatus } from "../constants/http-status";
import { AuthMessages } from "../constants/messages";

export class ForbiddenError extends AppError {
  constructor(message: string = AuthMessages.FORBIDDEN) {
    super(HttpStatus.FORBIDDEN, message, "FORBIDDEN");
  }
}