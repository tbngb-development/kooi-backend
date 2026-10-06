import { Router } from "express";
import type { AdminBolnaApiKeyController } from "./admin-bolna-api-key.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate, validateQuery } from "../../../shared/middleware/validate";
import {
  createBolnaApiKeySchema,
  assignKeySchema,
  switchReadinessQuerySchema,
} from "./bolna-api-key.schema";

export function buildAdminBolnaApiKeyRoutes(
  controller: AdminBolnaApiKeyController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  // Readiness check & migration status
  router.get(
    "/switch-readiness",
    validateQuery(switchReadinessQuerySchema),
    controller.getReadiness,
  );
  router.get("/tenants/:tenantId/switch-status", controller.getStatus);

  // CRUD & Assign
  router.get("/", controller.list);
  router.post("/", validate(createBolnaApiKeySchema), controller.create);
  router.post("/:id/assign", validate(assignKeySchema), controller.assign);
  router.post("/:id/deactivate", controller.deactivate);

  return router;
}
  