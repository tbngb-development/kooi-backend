// modules/calls/domain/errors/call.errors.ts

import { NotFoundError } from "../../../../shared/errors/not-found.error";
import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class CallNotFoundError extends NotFoundError {
  constructor() {
    super("Call");
  }
}

export class CallAlreadyDeletedError extends AppError {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      "Call is already archived",
      "CALL_ALREADY_ARCHIVED",
    );
  }
}

export class CallNotDeletedError extends AppError {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      "Call is not currently archived",
      "CALL_NOT_ARCHIVED",
    );
  }
}