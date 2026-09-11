import { Router } from "express";
import type { AdminPlanController } from "./admin-plan.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate } from "../../../shared/middleware/validate";
import {
  createPlanSchema,
  updatePlanSchema,
  createPlanVersionSchema,
  updateTenantPlanOverridesSchema,
  changePlanSchema,
} from "./plan.schema";

export function buildAdminPlanRoutes(
  controller: AdminPlanController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  // Plan Family Management
  router.get("/", controller.list);
  router.get("/:id", controller.get);
  router.post("/", validate(createPlanSchema), controller.create);
  router.patch("/:id", validate(updatePlanSchema), controller.update);

  // Immutable Version Lifecycle Management
  router.post(
    "/:id/versions",
    validate(createPlanVersionSchema),
    controller.createVersion,
  );
  router.post("/versions/:versionId/publish", controller.publishVersion);
  router.post("/versions/:versionId/archive", controller.archiveVersion);

  // Customer-Specific Commercial Overrides
  router.patch(
    "/tenants/:tenantId/overrides",
    validate(updateTenantPlanOverridesSchema),
    controller.updateTenantOverrides,
  );

  router.post(
    "/tenants/:tenantId/change-plan",
    validate(changePlanSchema),
    controller.changeTenantPlan,
  );

  return router;
}
