import { HttpStatus } from "../../../shared/constants";
import { AppError, NotFoundError } from "../../../shared/errors";

export class TenantNotFoundError extends NotFoundError {
  constructor() {
    super("Tenant");
  }
}

export class TenantBadRequestError extends AppError {
  constructor(message: string) {
    super(HttpStatus.BAD_REQUEST, message, "TENANT_BAD_REQUEST_ERROR");
  }
}

export class TenantVerificationRequiredError extends AppError {
  constructor(
    message = "Identity verification required. Please verify your mobile number in workspace settings to unlock lead processing on your trial plan.",
  ) {
    super(HttpStatus.FORBIDDEN, message, "TENANT_VERIFICATION_REQUIRED");
  }
}

export class TenantAlreadyVerifiedError extends AppError {
  constructor(message = "This workspace is already verified.") {
    super(HttpStatus.BAD_REQUEST, message, "TENANT_ALREADY_VERIFIED");
  }
}

export class VerificationCooldownActiveError extends AppError {
  constructor(
    message = "Please wait 60 seconds before requesting another verification code.",
  ) {
    super(HttpStatus.TOO_MANY_REQUESTS, message, "VERIFICATION_COOLDOWN_ACTIVE");
  }
}

export class InvalidPhoneNumberError extends AppError {
  constructor(
    message = "Invalid mobile number format. Please provide a valid E.164 phone number.",
  ) {
    super(HttpStatus.BAD_REQUEST, message, "INVALID_PHONE_NUMBER");
  }
}

export class InvalidVerificationOtpError extends AppError {
  constructor(attemptsRemaining?: number) {
    const msg =
      attemptsRemaining !== undefined && attemptsRemaining > 0
        ? `Invalid verification code. ${attemptsRemaining} attempt(s) remaining.`
        : "Invalid or expired verification code.";
    super(HttpStatus.BAD_REQUEST, msg, "INVALID_VERIFICATION_OTP");
  }
}

export class VerificationOtpMaxAttemptsError extends AppError {
  constructor() {
    super(
      HttpStatus.TOO_MANY_REQUESTS,
      "Maximum verification attempts exceeded. Please request a new verification code.",
      "VERIFICATION_OTP_MAX_ATTEMPTS",
    );
  }
}
