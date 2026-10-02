import { Router } from "express";
import type { AdminLeadController } from "./admin-lead.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validateQuery } from "../../../shared/middleware/validate";
import {
  adminGetLeadsStatsQuerySchema,
  adminListLeadsQuerySchema,
} from "./lead.schema";
export function buildAdminLeadRoutes(
  controller: AdminLeadController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  // Use the admin-specific schemas that allow tenantId
  router.get(
    "/stats",
    validateQuery(adminGetLeadsStatsQuerySchema),
    controller.stats,
  );
  router.get("/", validateQuery(adminListLeadsQuerySchema), controller.list);
  router.get("/:id", controller.get);

  return router;
}
