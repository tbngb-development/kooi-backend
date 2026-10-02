import { AppError } from "./app.error";
import { HttpStatus } from "../constants/http-status";
import { AuthMessages } from "../constants/messages";

export class UnauthorizedError extends AppError {
  constructor(message: string = AuthMessages.INVALID_TOKEN) {
    super(HttpStatus.UNAUTHORIZED, message, "UNAUTHORIZED");
  }
}