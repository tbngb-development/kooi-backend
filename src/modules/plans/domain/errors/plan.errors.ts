import { NotFoundError } from "../../../../shared/errors/not-found.error";
import { ForbiddenError } from "../../../../shared/errors/forbidden.error";
import { ConflictError } from "../../../../shared/errors/conflict.error";

export class PlanNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super(identifier ? `Plan ${identifier}` : "Plan");
  }
}

export class TenantPlanNotFoundError extends NotFoundError {
  constructor(tenantId: string) {
    super(`Plan for tenant ${tenantId}`);
  }
}

export class PlanNotActiveError extends ForbiddenError {
  constructor() {
    super("Plan is not active. Payment required.");
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
      "Custom/Enterprise plans cannot be self-selected. Please contact sales.",
    );
  }
}
