import { Router } from "express";
import type { TenantBatchController } from "./tenant-batch.controller";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import type { EnforceTenantVerificationMiddleware } from "../../../shared/middleware/enforce-tenant-verification";
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
  enforceVerification?: EnforceTenantVerificationMiddleware,
): Router {
  const router = Router({ mergeParams: true });

  const verificationGuard = enforceVerification
    ? [enforceVerification.check()]
    : [];

  router.get("/", controller.list);

  // File upload path (restricted for unverified trial)
  router.post(
    "/",
    ...verificationGuard,
    leadsUploadMemory.single("file"),
    validate(createBatchBodySchema),
    controller.create,
  );

  // Manual data entry path (restricted for unverified trial)
  router.post(
    "/manual",
    ...verificationGuard,
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

  router.post("/:batchId/run", ...verificationGuard, controller.run);
  router.post(
    "/:batchId/schedule",
    ...verificationGuard,
    validate(scheduleBatchSchema),
    controller.schedule,
  );
  router.post("/:batchId/stop", controller.stop);
  router.post("/:batchId/resume", controller.resume);

  return router;
}
