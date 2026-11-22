import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

/** The actor is not allowed to grant the requested tenant role. */
export class RoleNotInvitableError extends AppError {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      "You are not allowed to invite a member with this role",
      "FORBIDDEN_ROLE",
    );
  }
}

/** The tenant has no free seats (members + pending invites) for another invite. */
export class TeamSeatLimitError extends AppError {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      "Your plan's team member limit has been reached",
      "SEAT_LIMIT_REACHED",
    );
  }
}

/** The user already belongs to the target workspace. */
export class AlreadyMemberError extends AppError {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      "This user is already a member of the workspace",
      "ALREADY_MEMBER",
    );
  }
}

/** The token is unknown, revoked, accepted, or otherwise unusable. */
export class InviteInvalidError extends AppError {
  constructor() {
    super(
      HttpStatus.NOT_FOUND,
      "This invitation is invalid or no longer available",
      "INVITE_INVALID",
    );
  }
}

/** The invitation existed but its validity window has passed. */
export class InviteExpiredError extends AppError {
  constructor() {
    super(
      HttpStatus.GONE,
      "This invitation has expired. Ask the workspace admin for a new one.",
      "INVITE_EXPIRED",
    );
  }
}

/** A lifecycle operation was attempted on a non-PENDING invitation. */
export class InviteNotPendingError extends AppError {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      "This invitation is no longer pending",
      "INVITE_NOT_PENDING",
    );
  }
}

/** The logged-in account's email differs from the invited email. */
export class EmailMismatchError extends AppError {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      "This invitation was sent to a different email address",
      "EMAIL_MISMATCH",
    );
  }
}

/** The tenant is suspended, so no membership changes are allowed. */
export class TenantSuspendedError extends AppError {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      "This workspace is suspended and cannot accept new members",
      "TENANT_SUSPENDED",
    );
  }
}

/** The authenticated account is inactive. */
export class UserInactiveError extends AppError {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      "This account is inactive",
      "USER_INACTIVE",
    );
  }
}

/** A new-user accept was attempted for an email that already has an account. */
export class AccountExistsError extends AppError {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      "An account already exists for this email. Log in to accept the invitation.",
      "ACCOUNT_EXISTS",
    );
  }
}
