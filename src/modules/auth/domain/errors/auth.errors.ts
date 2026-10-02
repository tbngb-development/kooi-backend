import { UnauthorizedError } from "../../../../shared/errors/unauthorized.error";
import { ConflictError } from "../../../../shared/errors/conflict.error";
import { ForbiddenError } from "../../../../shared/errors/forbidden.error";
import { NotFoundError } from "../../../../shared/errors/not-found.error";
import { AuthMessages } from "../../../../shared/constants/messages";

export class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super(AuthMessages.INVALID_CREDENTIALS);
  }
}

export class EmailAlreadyExistsError extends ConflictError {
  constructor() {
    super(AuthMessages.EMAIL_ALREADY_EXISTS);
  }
}

export class RefreshTokenInvalidError extends UnauthorizedError {
  constructor() {
    super(AuthMessages.REFRESH_TOKEN_INVALID);
  }
}

export class RefreshTokenExpiredError extends UnauthorizedError {
  constructor() {
    super(AuthMessages.REFRESH_TOKEN_EXPIRED);
  }
}

export class TenantInactiveError extends ForbiddenError {
  constructor() {
    super(AuthMessages.TENANT_INACTIVE);
  }
}

export class MembershipNotFoundError extends NotFoundError {
  constructor() {
    super("Membership");
  }
}

export class AlreadyMemberError extends ConflictError {
  constructor() {
    super(AuthMessages.ALREADY_MEMBER);
  }
}

export class InvalidInviteError extends UnauthorizedError {
  constructor() {
    super(AuthMessages.INVALID_INVITE);
  }
}

export class NotPlatformAdminError extends ForbiddenError {
  constructor() {
    super(AuthMessages.NOT_PLATFORM_ADMIN);
  }
}

export class InvalidOtpError extends UnauthorizedError {
  constructor() {
    super(AuthMessages.OTP_INVALID);
  }
}

export class OtpMaxAttemptsError extends UnauthorizedError {
  constructor() {
    super(AuthMessages.OTP_MAX_ATTEMPTS);
  }
}

export class InvalidResetTokenError extends UnauthorizedError {
  constructor() {
    super(AuthMessages.RESET_TOKEN_INVALID);
  }
}

export class InvalidOldPasswordError extends UnauthorizedError {
  constructor() {
    super(AuthMessages.INVALID_OLD_PASSWORD);
  }
}

export class SamePasswordError extends ConflictError {
  constructor() {
    super(AuthMessages.SAME_PASSWORD_NOT_ALLOWED);
  }
}
