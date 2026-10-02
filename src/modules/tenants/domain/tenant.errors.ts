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
