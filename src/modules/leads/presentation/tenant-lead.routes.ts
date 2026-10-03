import { Router } from "express";
import type { TenantLeadController } from "./tenant-lead.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validateQuery } from "../../../shared/middleware/validate";
import { listLeadsQuerySchema, getLeadsStatsQuerySchema } from "./lead.schema";

export function buildTenantLeadRoutes(
  controller: TenantLeadController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.tenant());

  // Fixed routes must be registered before parameterized /:id
  router.get(
    "/stats",
    validateQuery(getLeadsStatsQuerySchema),
    controller.stats,
  );

  router.get("/", validateQuery(listLeadsQuerySchema), controller.list);

  router.get("/:id", controller.get);

  router.patch(
    "/:id/archive",
    authorize.tenantRoles("OWNER", "ADMIN"),
    controller.archive,
  );
  return router;
}
