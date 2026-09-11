import { NotFoundError } from "../../../../shared/errors/not-found.error";
import { AppError } from "../../../../shared/errors/app.error";
import { ForbiddenError } from "../../../../shared/errors/forbidden.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class RechargeNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super(identifier ? `Recharge ${identifier}` : "Recharge");
  }
}

export class InvalidSignatureError extends AppError {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      "Invalid payment signature",
      "INVALID_SIGNATURE",
    );
  }
}

export class PaymentAlreadyProcessedError extends AppError {
  constructor(rechargeId: string) {
    super(
      HttpStatus.CONFLICT,
      `Payment already processed for recharge ${rechargeId}`,
      "PAYMENT_ALREADY_PROCESSED",
    );
  }
}

export class PlanAlreadyActiveError extends AppError {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      "Plan is already active. Use wallet top-up instead.",
      "PLAN_ALREADY_ACTIVE",
    );
  }
}

export class NoPendingPlanError extends AppError {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      "No pending plan found. Please select a plan first.",
      "NO_PENDING_PLAN",
    );
  }
}

export class FreeOnboardingRequiresAdminError extends ForbiddenError {
  constructor() {
    super(
      "Free onboarding activation requires admin authorization. Use the admin endpoint.",
    );
  }
}

export class OnboardingFeeNotZeroError extends AppError {
  constructor(expectedFee: number) {
    super(
      HttpStatus.BAD_REQUEST,
      `Cannot use free activation. Onboarding fee is ₹${(expectedFee / 100).toFixed(2)}. Complete payment via Razorpay.`,
      "ONBOARDING_FEE_NOT_ZERO",
    );
  }
}
