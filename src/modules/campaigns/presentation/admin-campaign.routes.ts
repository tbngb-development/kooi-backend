import { Router } from "express";
import type { AdminCampaignController } from "./admin-campaign.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";

export function buildAdminCampaignRoutes(
  controller: AdminCampaignController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  router.get("/", controller.list);
  router.get("/:id", controller.get);
  router.get("/:id/stats", controller.stats);
  router.get("/:id/performance", controller.performance);
  router.get("/:id/performance-v2", controller.performanceV2);

  return router;
}
