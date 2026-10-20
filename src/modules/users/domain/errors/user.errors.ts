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

export class InsufficientRoleHierarchyError extends AppError {
  constructor(
    message = "Admins cannot modify, promote, or delete an organization owner",
  ) {
    super(HttpStatus.FORBIDDEN, message, "INSUFFICIENT_ROLE_PERMISSIONS");
  }
}

export class CannotGrantOwnerRoleError extends AppError {
  constructor(
    message = "Only an organization owner can grant owner privileges",
  ) {
    super(HttpStatus.FORBIDDEN, message, "OWNER_GRANT_FORBIDDEN");
  }
}

export class LastOwnerCannotBeRemovedError extends AppError {
  constructor(
    message = "Cannot remove or demote the final owner of the organization",
  ) {
    super(HttpStatus.BAD_REQUEST, message, "LAST_OWNER_REMOVAL_FORBIDDEN");
  }
}
