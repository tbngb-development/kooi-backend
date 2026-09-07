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

export class CampaignBrochureNotFoundError extends NotFoundError {
  constructor() {
    super("Brochure");
  }
}

export class BrochureNotConfirmedError extends AppError {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Brochure must be confirmed before linking to a campaign",
      "BROCHURE_NOT_CONFIRMED",
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

export class InvalidCampaignStatusTransitionError extends AppError {
  constructor(from: CampaignStatus, to: CampaignStatus) {
    super(
      HttpStatus.CONFLICT,
      `Invalid campaign status transition: ${from} → ${to}`,
      "INVALID_STATUS_TRANSITION",
    );
  }
}
