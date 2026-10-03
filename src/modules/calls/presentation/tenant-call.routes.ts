// modules/calls/presentation/tenant-call.routes.ts

import { Router } from "express";
import type { TenantCallController } from "./tenant-call.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validateQuery } from "../../../shared/middleware/validate";
import {
  listCallsQuerySchema,
  getCallStatsQuerySchema,
  availableFiltersQuerySchema,
} from "./call.schema";

export function buildTenantCallRoutes(
  controller: TenantCallController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.tenant());

  router.get(
    "/stats",
    validateQuery(getCallStatsQuerySchema),
    controller.stats,
  );

  router.get("/", validateQuery(listCallsQuerySchema), controller.list);
  router.get(
    "/available-filters",
    validateQuery(availableFiltersQuerySchema),
    controller.getAvailableFilters,
  );
  router.get("/:id/transcript", controller.getTranscriptHandler);

  // Archive (Soft Delete) individual call
  router.patch(
    "/:id/archive",
    authorize.tenantRoles("OWNER", "ADMIN"),
    controller.archive,
  );

  router.get("/:id", controller.get);

  return router;
}