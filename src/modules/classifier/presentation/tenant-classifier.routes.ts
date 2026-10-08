import { Router } from "express";
import type { TenantClassifierController } from "./tenant-classifier.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import { validateQuery } from "../../../shared/middleware/validate";
import { listClassifierResultsQuerySchema } from "./classifier.schema";

export function buildTenantClassifierRoutes(
  controller: TenantClassifierController,
  authenticate: AuthenticateMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.tenant());

  router.get(
    "/results",
    validateQuery(listClassifierResultsQuerySchema),
    controller.listCallResultsHandler,
  );
  router.get("/results/:callId", controller.getCallResultHandler);

  return router;
}
