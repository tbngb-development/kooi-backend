import { Router } from "express";
import type { TenantCallController } from "./tenant-call.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import { validateQuery } from "../../../shared/middleware/validate";
import {
  listCallsQuerySchema,
  getCallStatsQuerySchema,
  availableFiltersQuerySchema,
} from "./call.schema";

export function buildTenantCallRoutes(
  controller: TenantCallController,
  authenticate: AuthenticateMiddleware,
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
  router.get(
    "/:id/extraction-response",
    controller.getExtractionResponseHandler,
  );
  router.get("/:id", controller.get);

  return router;
}
