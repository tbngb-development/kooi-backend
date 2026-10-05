import { Router } from "express";
import type { TenantBatchController } from "./tenant-batch.controller";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate } from "../../../shared/middleware/validate";
import {
  createBatchBodySchema,
  createManualBatchBodySchema,
  scheduleBatchSchema,
} from "./batch.schema";
import { leadsUploadMemory } from "../../../shared/middleware/upload";
import { manualBatchRateLimiter } from "../../../shared/middleware/rate-limiters";

export function buildTenantBatchRoutes(
  controller: TenantBatchController,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router({ mergeParams: true });

  router.get("/", controller.list);

  // File upload path (existing)
  router.post(
    "/",
    leadsUploadMemory.single("file"),
    validate(createBatchBodySchema),
    controller.create,
  );

  // Manual data entry path (new)
  router.post(
    "/manual",
    manualBatchRateLimiter,
    validate(createManualBatchBodySchema),
    controller.createManual,
  );
  
  router.get("/:batchId", controller.get);
  router.get("/:batchId/stats", controller.stats);

  router.delete(
    "/:batchId",
    authorize.tenantRoles("OWNER", "ADMIN"),
    controller.remove,
  );

  router.patch(
    "/:batchId/archive",
    authorize.tenantRoles("OWNER", "ADMIN"),
    controller.archive,
  );

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
