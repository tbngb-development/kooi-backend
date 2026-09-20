import { NotFoundError } from "../../../../shared/errors/not-found.error";
import { ForbiddenError } from "../../../../shared/errors/forbidden.error";
import { ConflictError } from "../../../../shared/errors/conflict.error";
import { HttpStatus } from "../../../../shared/constants";
import { AppError } from "../../../../shared/errors";

export class PlanNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super(identifier ? `Plan ${identifier}` : "Plan");
  }
}

export class PlanVersionNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super(identifier ? `PlanVersion ${identifier}` : "Plan version");
  }
}

export class TenantPlanNotFoundError extends NotFoundError {
  constructor(tenantId: string) {
    super(`Active plan for tenant ${tenantId}`);
  }
}

export class PlanNotActiveError extends ForbiddenError {
  constructor() {
    super("Plan is not active. Payment or onboarding required.");
  }
}

export class TenantPlanAlreadyActiveError extends ConflictError {
  constructor() {
    super("Tenant already has an active plan. Use the upgrade flow instead.");
  }
}

export class PlanLimitExceededError extends ForbiddenError {
  constructor(feature: string, limit: number) {
    super(
      `Plan limit reached: max ${limit} ${feature} allowed on your current plan.`,
    );
  }
}

export class PlanFeatureNotAvailableError extends ForbiddenError {
  constructor(feature: string) {
    super(`Feature not available on your current plan: ${feature}`);
  }
}

export class PlanSlugConflictError extends ConflictError {
  constructor(slug: string) {
    super(`Plan with slug already exists: ${slug}`);
  }
}

export class CustomPlanSelectionNotAllowedError extends ForbiddenError {
  constructor() {
    super(
      "Custom/Enterprise plans cannot be self-selected. Please contact support or request an invite.",
    );
  }
}

export class PlanVersionImmutableError extends ConflictError {
  constructor(status: string) {
    super(
      `Cannot modify plan version in '${status}' status. Create a new draft version instead.`,
    );
  }
}

export class NoPublishedPlanVersionError extends NotFoundError {
  constructor(planSlugOrId: string) {
    super(`No published version found for plan ${planSlugOrId}`);
  }
}

export class ScheduledCampaignConflictError extends AppError {
  constructor(timeStr: string, maxAllowed: number) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      `Another campaign is already scheduled/running around ${timeStr}. Your plan allows a maximum of ${maxAllowed} concurrent campaign(s). Please choose a different time slot.`,
      "SCHEDULED_CAMPAIGN_CONFLICT",
    );
  }
}
