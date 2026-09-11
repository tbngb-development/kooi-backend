import { NotFoundError } from "../../../../shared/errors/not-found.error";
import { ForbiddenError } from "../../../../shared/errors/forbidden.error";
import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class WalletNotFoundError extends NotFoundError {
  constructor(tenantId?: string) {
    super(tenantId ? `Wallet for tenant ${tenantId}` : "Wallet");
  }
}

export class WalletInactiveError extends ForbiddenError {
  constructor() {
    super("Wallet is inactive. Please contact support.");
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(
    message = "Insufficient wallet balance to perform this operation",
  ) {
    super(HttpStatus.BAD_REQUEST, message, "INSUFFICIENT_BALANCE");
  }
}

export class InvalidTransactionAmountError extends AppError {
  constructor(
    message = "Transaction amount must be a positive integer in paisa",
  ) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      message,
      "INVALID_TRANSACTION_AMOUNT",
    );
  }
}
