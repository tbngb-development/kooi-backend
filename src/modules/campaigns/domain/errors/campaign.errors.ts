import { NotFoundError } from "../../../../shared/errors/not-found.error";
import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";
import type { CampaignStatus } from "@prisma/client";

export class CampaignNotFoundError extends NotFoundError {
  constructor() {
    super("Campaign");
  }
}

export class CampaignAssistantNotFoundError extends NotFoundError {
  constructor() {
    super("Assistant");
  }
}


export class CampaignIdRequiredError extends AppError {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      `Campaign id not found`,
      "CAMPAIGN_Id_NOT_FOUND",
    );
  }
}

export class CampaignFailedError extends AppError {
  constructor(action: string) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      `Cannot ${action} a failed campaign`,
      "CAMPAIGN_FAILED",
    );
  }
}

export class MaxActiveCampaignsReachedError extends AppError {
  constructor(maxAllowed: number) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      `You have reached the maximum active campaigns limit (${maxAllowed}) allowed on your plan`,
      "MAX_ACTIVE_CAMPAIGNS_REACHED",
    );
  }
}

export class InvalidCampaignStatusTransitionError extends AppError {
  constructor(from: CampaignStatus, to: CampaignStatus) {
    super(
      HttpStatus.CONFLICT,
      `Invalid campaign status transition: ${from} → ${to}`,
      "INVALID_STATUS_TRANSITION",
    );
  }
}

export class MissingRequiredVariablesError extends AppError {
  constructor(missingVariables: string[]) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      `Missing required campaign variables: ${missingVariables.join(", ")}`,
      "MISSING_REQUIRED_VARIABLES",
    );
  }
}

export class RetryConfigNotAllowedError extends AppError {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Retry automation is not available on your current plan",
      "RETRY_CONFIG_NOT_ALLOWED",
    );
  }
}
