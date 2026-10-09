// modules/campaigns/presentation/admin-campaign.routes.ts

import { Router } from "express";
import type { AdminCampaignController } from "./admin-campaign.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";

import { validate } from "../../../shared/middleware/validate";
import { updateCampaignStatusSchema } from "./campaign.schema";

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

  // Administrative status update
  router.patch(
    "/:id/status",
    validate(updateCampaignStatusSchema),
    controller.updateStatus,
  );

  // Administrative soft delete capabilities
  router.patch("/:id/archive", controller.archive);
  router.patch("/:id/restore", controller.restore);

  return router;
}
