import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getTenantContext } from "../utils/tenant-context";
import type { PlanRepository } from "../../modules/plans/application/interfaces/plan-repository.interface";
import {
  PlanNotActiveError,
  PlanLimitExceededError,
  PlanFeatureNotAvailableError,
  TenantPlanNotFoundError,
} from "../../modules/plans/domain/errors/plan.errors";

export type PlanFeature =
  | "CREATE_CAMPAIGN"
  | "RETRY_AUTOMATION"
  | "MAX_LEADS_PER_BATCH"
  | "MAX_AGENTS"
  | "MAX_TEAM_MEMBERS"
  | "BROCHURE_UPLOAD";

export class EnforcePlanMiddleware {
  constructor(private readonly planRepo: PlanRepository) {}

  check(feature: PlanFeature): RequestHandler {
    return async (req: Request, _res: Response, next: NextFunction) => {
      try {
        const ctx = getTenantContext(req);

        const plan = await this.planRepo.getActivePlanForTenant(ctx.tenantId);
        if (!plan) throw new TenantPlanNotFoundError(ctx.tenantId);
        if (plan.status !== "ACTIVE") throw new PlanNotActiveError();

        switch (feature) {
          case "CREATE_CAMPAIGN":
            if (plan.maxActiveCampaigns !== null) {
              const count = await this.planRepo.countActiveCampaigns(
                ctx.tenantId,
              );
              if (count >= plan.maxActiveCampaigns) {
                throw new PlanLimitExceededError(
                  "active campaigns",
                  plan.maxActiveCampaigns,
                );
              }
            }
            break;

          case "RETRY_AUTOMATION":
            if (!plan.retryAutomation) {
              throw new PlanFeatureNotAvailableError("retry automation");
            }
            break;

          case "MAX_LEADS_PER_BATCH":
            // Enforced inside use-case with payload count
            break;

          case "MAX_AGENTS":
            if (plan.maxAgents !== null) {
              const count = await this.planRepo.countAgents(ctx.tenantId);
              if (count >= plan.maxAgents) {
                throw new PlanLimitExceededError("agents", plan.maxAgents);
              }
            }
            break;

          case "MAX_TEAM_MEMBERS":
            if (plan.maxTeamMembers !== null) {
              const count = await this.planRepo.countTeamMembers(ctx.tenantId);
              if (count >= plan.maxTeamMembers) {
                throw new PlanLimitExceededError(
                  "team members",
                  plan.maxTeamMembers,
                );
              }
            }
            break;

          case "BROCHURE_UPLOAD":
            if (!plan.brochureUpload) {
              throw new PlanFeatureNotAvailableError("brochure upload");
            }
            break;
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }
}
