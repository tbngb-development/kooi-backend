import { NotFoundError } from "../../../../shared/errors/not-found.error";
import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class AssistantNotFoundError extends NotFoundError {
  constructor() {
    super("Assistant");
  }
}

export class BolnaAgentNotFoundError extends AppError {
  constructor(bolnaId: string) {
    super(
      HttpStatus.BAD_REQUEST,
      `Bolna agent not found: ${bolnaId}. Please verify this ID exists in your Bolna dashboard.`,
      "BOLNA_AGENT_NOT_FOUND",
    );
  }
}

export class BolnaVerificationFailedError extends AppError {
  constructor(detail: string) {
    super(
      HttpStatus.BAD_GATEWAY,
      `Failed to verify Bolna agent: ${detail}`,
      "BOLNA_VERIFICATION_FAILED",
    );
  }
}

export class AssistantInUseError extends AppError {
  constructor(campaignCount: number) {
    super(
      HttpStatus.CONFLICT,
      `Cannot delete assistant — it is currently referenced by ${campaignCount} campaign(s).`,
      "ASSISTANT_IN_USE",
    );
  }
}

export class PlatformAgentNotActiveError extends AppError {
  constructor(agentId: string) {
    super(
      HttpStatus.BAD_REQUEST,
      `Platform agent template '${agentId}' is currently deactivated by system administrators.`,
      "PLATFORM_AGENT_NOT_ACTIVE",
    );
  }
}

export class PlatformAgentDedicatedError extends AppError {
  constructor(agentId: string) {
    super(
      HttpStatus.CONFLICT,
      `Platform agent template '${agentId}' is marked as dedicated/featured and is already assigned to another tenant workspace.`,
      "PLATFORM_AGENT_DEDICATED",
    );
  }
}

export class ApiKeyMismatchError extends AppError {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      "Infrastructure isolation error: Your assigned Tenant Bolna API key is incompatible with the platform agent's required Bolna workspace connection.",
      "API_KEY_MISMATCH",
    );
  }
}

export class PlatformAgentAlreadyAssignedError extends AppError {
  constructor(agentId: string, tenantId: string) {
    super(
      HttpStatus.CONFLICT,
      `Platform agent template '${agentId}' has already been assigned to tenant '${tenantId}'.`,
      "PLATFORM_AGENT_ALREADY_ASSIGNED",
    );
  }
}
