import { Router } from "express";
import type { TenantBatchController } from "./tenant-batch.controller";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate } from "../../../shared/middleware/validate";
import { createBatchBodySchema, scheduleBatchSchema } from "./batch.schema";
import { leadsUploadMemory } from "../../../shared/middleware/upload";

/**
 * Nested batch routes mounted under /api/v1/campaigns/:campaignId/batches.
 * Authentication is handled by the parent campaign router.
 */
export function buildTenantBatchRoutes(
  controller: TenantBatchController,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router({ mergeParams: true });

  // Collection
  router.get("/", controller.list);
  router.post(
    "/",
    leadsUploadMemory.single("file"),
    validate(createBatchBodySchema),
    controller.create,
  );
  // Single resource
  router.get("/:batchId", controller.get);
  router.get("/:batchId/stats", controller.stats);
  router.delete(
    "/:batchId",
    authorize.tenantRoles("OWNER", "ADMIN"),
    controller.remove,
  );

  // Lifecycle
  router.post("/:batchId/run", controller.run);
  router.post(
    "/:batchId/schedule",
    validate(scheduleBatchSchema),
    controller.schedule,
  );
  router.post("/:batchId/stop", controller.stop);
  router.post("/:batchId/resume", controller.resume);

  return router;
}
