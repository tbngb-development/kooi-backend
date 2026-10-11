import { Router } from "express";
import type { CallCenterController } from "./call-center.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import { validateQuery } from "../../../shared/middleware/validate";
import { exportCallCenterCsvQuerySchema } from "./call-center.schema";

export function buildCallCenterRoutes(
  controller: CallCenterController,
  authenticate: AuthenticateMiddleware,
): Router {
  const router = Router();
  router.use(authenticate.tenant());

  router.get("/kpis", controller.getKPIs);
  router.get("/numbers", controller.getNumberRoster);
  router.get(
    "/calls/export",
    validateQuery(exportCallCenterCsvQuerySchema),
    controller.exportCsv,
  );

  return router;
}
