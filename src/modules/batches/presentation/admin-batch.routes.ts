// modules/batches/presentation/admin-batch.routes.ts

import { Router } from "express";
import type { AdminBatchController } from "./admin-batch.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";

export function buildAdminBatchRoutes(
  controller: AdminBatchController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  router.get("/", controller.list);
  router.get("/:id", controller.get);
  router.get("/:id/stats", controller.stats);
  router.patch("/:id/archive", controller.archive);
  router.patch("/:id/restore", controller.restore);

  // Operational controls
  router.post("/:id/abort", controller.abort);
  router.post("/:id/stop", controller.abort);
  router.post("/:id/resume", controller.resume);
  router.post("/:id/retry-failed", controller.retryFailed);

  return router;
}
