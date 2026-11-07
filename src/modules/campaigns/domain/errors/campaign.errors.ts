// modules/campaigns/domain/errors/campaign.errors.ts

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

export class CampaignAssistantRequiredError extends AppError {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      "assistantId is required for Bolna campaigns",
      "CAMPAIGN_ASSISTANT_REQUIRED",
    );
  }
}

export class CampaignSarvamAgentNotFoundError extends NotFoundError {
  constructor() {
    super("SarvamAgent");
  }
}

export class CampaignSarvamAgentRequiredError extends AppError {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      "sarvamAgentId is required for Sarvam campaigns",
      "CAMPAIGN_SARVAM_AGENT_REQUIRED",
    );
  }
}

export class ExternalCampaignCreationFailedError extends AppError {
  constructor(reason: string) {
    super(
      HttpStatus.BAD_GATEWAY,
      `Failed to create external campaign: ${reason}`,
      "EXTERNAL_CAMPAIGN_CREATION_FAILED",
    );
  }
}

export class CampaignScheduleRequiredError extends AppError {
  constructor(
    message: string = "Campaign scheduling (start/end timestamp and allowed schedule) is required for Sarvam campaigns",
  ) {
    super(
      HttpStatus.BAD_REQUEST,
      message,
      "CAMPAIGN_SCHEDULE_REQUIRED",
    );
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

export class InvalidCampaignVariableValueError extends AppError {
  constructor(invalidVariables: Array<{ key: string; reason: string }>) {
    const details = invalidVariables.map((iv) => `${iv.key} (${iv.reason})`).join(", ");
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      `Invalid campaign variable value(s): ${details}`,
      "INVALID_CAMPAIGN_VARIABLE_VALUE",
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

export class CampaignNotArchivableError extends AppError {
  constructor(status: CampaignStatus) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      `Cannot archive campaign in active or non-terminal status: '${status}'. Stop or complete the campaign first.`,
      "CAMPAIGN_NOT_ARCHIVABLE",
    );
  }
}

export class CampaignAlreadyDeletedError extends AppError {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      "Campaign is already archived",
      "CAMPAIGN_ALREADY_ARCHIVED",
    );
  }
}

export class CampaignNotDeletedError extends AppError {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      "Campaign is not currently archived",
      "CAMPAIGN_NOT_ARCHIVED",
    );
  }
}

export class CampaignNotDraftError extends AppError {
  constructor(status: CampaignStatus) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      `Campaign can only be updated when in DRAFT status. Current status is '${status}'.`,
      "CAMPAIGN_NOT_DRAFT",
    );
  }
}
