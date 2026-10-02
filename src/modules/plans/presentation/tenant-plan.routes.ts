import { Router } from "express";
import type { TenantPlanController } from "./tenant-plan.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import { validate } from "../../../shared/middleware/validate";
import { changePlanSchema } from "./plan.schema";

export function buildTenantPlanRoutes(
  controller: TenantPlanController,
  authenticate: AuthenticateMiddleware,
): Router {
  const router = Router();

  // Catalogue: anyone authenticated can see published plans
  router.get("/available", authenticate.any(), controller.listAvailable);

  // Tenant workspace: current assigned plan and effective terms
  router.get("/mine", authenticate.tenant(), controller.getMine);

  // Self-selection: pick a plan before onboarding
  router.post("/:planId/select", authenticate.tenant(), controller.selectPlan);

  router.post(
    "/change",
    authenticate.tenant(),
    validate(changePlanSchema),
    controller.changePlan,
  );

  return router;
}
