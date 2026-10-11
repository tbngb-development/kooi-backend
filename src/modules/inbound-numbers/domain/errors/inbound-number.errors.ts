import {
  AppError,
  NotFoundError,
  ConflictError,
} from "../../../../shared/errors";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class InboundNumberNotFoundError extends NotFoundError {
  constructor(idOrPhone: string) {
    super(`Inbound number '${idOrPhone}' was not found.`);
    this.name = "InboundNumberNotFoundError";
  }
}

export class InboundNumberAlreadyExistsError extends ConflictError {
  constructor(phoneNumber: string) {
    super(`Inbound number '${phoneNumber}' already exists in inventory.`);
    this.name = "InboundNumberAlreadyExistsError";
  }
}

export class InboundNumberInvalidStateError extends AppError {
  constructor(action: string, currentStatus: string) {
    super(
      HttpStatus.BAD_REQUEST,
      `Cannot ${action} inbound number while in '${currentStatus}' status.`,
      "INBOUND_NUMBER_INVALID_STATE",
    );
    this.name = "InboundNumberInvalidStateError";
  }
}

export class InboundNumberProviderSyncError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(
      HttpStatus.BAD_GATEWAY,
      message,
      "INBOUND_NUMBER_PROVIDER_SYNC_ERROR",
      true,
      cause,
    );
    this.name = "InboundNumberProviderSyncError";
  }
}
