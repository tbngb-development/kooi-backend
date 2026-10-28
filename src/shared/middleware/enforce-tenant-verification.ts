import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getTenantContext } from "../utils/tenant-context";
import type { PlanRepository } from "../../modules/plans/application/interfaces/plan-repository.interface";
import type { TenantRepository } from "../../modules/tenants/application/interfaces/tenant-repository.interface";
import { TenantVerificationRequiredError } from "../../modules/tenants/domain/tenant.errors";
import type { Logger } from "../logging/logger.interface";

export class EnforceTenantVerificationMiddleware {
  constructor(
    private readonly planRepo: PlanRepository,
    private readonly tenantRepo: TenantRepository,
    private readonly logger?: Logger,
  ) {}

  check(): RequestHandler {
    return async (req: Request, _res: Response, next: NextFunction) => {
      try {
        const ctx = getTenantContext(req);

        // 1. Resolve active plan for the tenant
        const plan = await this.planRepo.getActivePlanForTenant(ctx.tenantId);

        // If the tenant is on a trial plan, verification is mandatory
        if (plan?.isTrial) {
          const tenant = await this.tenantRepo.findById(ctx.tenantId);
          if (!tenant || !tenant.isVerified) {
            this.logger?.warn(
              "Restricted feature access blocked: unverified trial tenant",
              {
                action: "tenant_verification.enforce.blocked",
                tenantId: ctx.tenantId,
                path: req.originalUrl || req.url,
                method: req.method,
              },
            );
            throw new TenantVerificationRequiredError();
          }
        }

        // Paid plans or verified trial tenants proceed
        next();
      } catch (error) {
        next(error);
      }
    };
  }
}
