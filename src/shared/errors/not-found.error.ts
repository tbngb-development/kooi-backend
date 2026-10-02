import { AppError } from "./app.error";
import { HttpStatus } from "../constants/http-status";

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(HttpStatus.NOT_FOUND, `${resource} not found`, "NOT_FOUND");
  }
}