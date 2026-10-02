import { AppError } from "./app.error";
import { HttpStatus } from "../constants/http-status";

export class ConflictError extends AppError {
  constructor(message: string) {
    super(HttpStatus.CONFLICT, message, "CONFLICT");
  }
}