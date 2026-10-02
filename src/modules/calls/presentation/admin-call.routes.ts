import { Router } from "express";
import type { AdminCallController } from "./admin-call.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validateQuery } from "../../../shared/middleware/validate";
import {
  adminGetCallStatsQuerySchema,
  adminListCallsQuerySchema,
} from "./call.schema";

export function buildAdminCallRoutes(
  controller: AdminCallController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  // Use the admin-specific schemas that allow tenantId
  router.get(
    "/stats",
    validateQuery(adminGetCallStatsQuerySchema),
    controller.stats,
  );
  router.get("/", validateQuery(adminListCallsQuerySchema), controller.list);
  router.get("/available-filters", controller.getAvailableFilters);
  router.get("/:id/transcript", controller.getTranscript);
  router.get("/:id", controller.get);

  return router;
}
