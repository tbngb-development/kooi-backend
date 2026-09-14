import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class PlatformAgentNotFoundError extends AppError {
  constructor(identifier: string) {
    super(
      HttpStatus.NOT_FOUND,
      `Platform agent '${identifier}' not found`,
      "PLATFORM_AGENT_NOT_FOUND",
    );
  }
}

export class DuplicatePlatformAgentSlugError extends AppError {
  constructor(slug: string) {
    super(
      HttpStatus.CONFLICT,
      `Platform agent with slug '${slug}' already exists`,
      "DUPLICATE_PLATFORM_AGENT_SLUG",
    );
  }
}

export class DuplicatePlatformAgentBolnaIdError extends AppError {
  constructor(bolnaId: string) {
    super(
      HttpStatus.CONFLICT,
      `Platform agent with Bolna ID '${bolnaId}' already registered`,
      "DUPLICATE_PLATFORM_AGENT_BOLNA_ID",
    );
  }
}

export class PlatformApiKeyMissingError extends AppError {
  constructor() {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      "No active platform-default Bolna API key configured",
      "PLATFORM_API_KEY_MISSING",
    );
  }
}

export class BolnaTemplateFetchError extends AppError {
  constructor(reason: string) {
    super(
      HttpStatus.BAD_GATEWAY,
      `Failed to fetch agent template from Bolna: ${reason}`,
      "BOLNA_TEMPLATE_FETCH_FAILED",
    );
  }
}