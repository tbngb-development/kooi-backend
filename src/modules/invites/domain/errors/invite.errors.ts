import { AppError } from "../../../../shared/errors/app.error";
import { NotFoundError } from "../../../../shared/errors/not-found.error";
import { ForbiddenError } from "../../../../shared/errors/forbidden.error";
import { ConflictError } from "../../../../shared/errors/conflict.error";
import { HttpStatus } from "../../../../shared/constants/http-status";
import { InviteMessages } from "../../../../shared/constants/messages";

export class InviteNotFoundError extends NotFoundError {
  constructor() {
    super("Invite");
  }
}

export class InviteInvalidError extends AppError {
  constructor(message = InviteMessages.INVALID) {
    super(HttpStatus.BAD_REQUEST, message, "INVITE_INVALID");
  }
}

export class InviteAlreadyAcceptedError extends ConflictError {
  constructor() {
    super(InviteMessages.ALREADY_ACCEPTED);
  }
}

export class InviteEmailMismatchError extends ForbiddenError {
  constructor() {
    super(InviteMessages.EMAIL_MISMATCH);
  }
}
