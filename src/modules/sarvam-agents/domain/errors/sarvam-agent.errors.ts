import { AppError } from "../../../../shared/errors/app.error";
import { NotFoundError } from "../../../../shared/errors/not-found.error";
import { ConflictError } from "../../../../shared/errors/conflict.error";
import { ForbiddenError } from "../../../../shared/errors/forbidden.error";
import { ValidationError } from "../../../../shared/errors/validation.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class SarvamAgentNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Sarvam Agent with id '${id}'`);
  }
}

export class SarvamAgentDuplicateAppIdError extends ConflictError {
  constructor(apiKeyId: string, appId: string) {
    super(
      `A Sarvam agent with App ID '${appId}' already exists under API Key '${apiKeyId}'.`,
    );
  }
}

export class SarvamAgentInvalidApiKeyError extends AppError {
  constructor(apiKeyId: string) {
    super(
      HttpStatus.BAD_REQUEST,
      `Referenced Sarvam API Key '${apiKeyId}' does not exist.`,
      "SARVAM_AGENT_INVALID_API_KEY",
    );
  }
}

export class SarvamAgentInactiveApiKeyError extends AppError {
  constructor(apiKeyId: string) {
    super(
      HttpStatus.BAD_REQUEST,
      `Referenced Sarvam API Key '${apiKeyId}' is inactive. Agents can only be created under active API keys.`,
      "SARVAM_AGENT_INACTIVE_API_KEY",
    );
  }
}

export class SarvamAgentArchivedError extends AppError {
  constructor(id: string) {
    super(
      HttpStatus.BAD_REQUEST,
      `Sarvam Agent '${id}' is archived and cannot be modified or executed.`,
      "SARVAM_AGENT_ARCHIVED",
    );
  }
}

export class SarvamAgentAccessDeniedError extends ForbiddenError {
  constructor(
    message: string = "You do not have permission to access or modify this Sarvam agent.",
  ) {
    super(message);
  }
}

export class SarvamAgentInvalidOverrideError extends ValidationError {
  constructor(message: string, field: string = "variables") {
    super([{ field, message }]);
  }
}
