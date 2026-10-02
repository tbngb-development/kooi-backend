import { NotFoundError } from "../../../../shared/errors/not-found.error";
import { ConflictError } from "../../../../shared/errors/conflict.error";
import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class UserNotFoundError extends NotFoundError {
  constructor() {
    super("User");
  }
}

export class EmailAlreadyRegisteredError extends ConflictError {
  constructor() {
    super("A user with this email is already registered");
  }
}

export class SelfDeletionError extends AppError {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      "You cannot remove your own tenant membership",
      "SELF_DELETION_FORBIDDEN",
    );
  }
}
