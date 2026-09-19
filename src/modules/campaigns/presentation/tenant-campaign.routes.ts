import { Router } from "express";
import type { TenantCampaignController } from "./tenant-campaign.controller";
import type { TenantBatchController } from "../../batches/presentation/tenant-batch.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate } from "../../../shared/middleware/validate";
import { createCampaignSchema } from "./campaign.schema";
import { buildTenantBatchRoutes } from "../../batches/presentation/tenant-batch.routes";
import { leadsUploadMemory } from "../../../shared/middleware/upload";

export function buildTenantCampaignRoutes(
  controller: TenantCampaignController,
  batchController: TenantBatchController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.tenant());

  // Nested batch routes at /:campaignId/batches
  router.use(
    "/:campaignId/batches",
    buildTenantBatchRoutes(batchController, authorize),
  );

  // Collection
  router.get("/", controller.list);
  router.post(
    "/",
    authorize.tenantRoles("OWNER", "ADMIN"),
    validate(createCampaignSchema),
    controller.create,
  );

  // Member routes (before /:id)
  router.get("/:id/stats", controller.stats);
  router.get("/:id/performance", controller.performance);
  router.get("/:id/performance-v2", controller.performanceV2);
  router.post(
    "/:id/parse-leads",
    leadsUploadMemory.single("file"),
    controller.parseLeads,
  );

  // Single resource
  router.get("/:id", controller.get);

  return router;
}
