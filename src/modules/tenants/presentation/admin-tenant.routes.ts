import { Router } from "express";
import type { AdminTenantController } from "./admin-tenant.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate } from "../../../shared/middleware/validate";
import { adminUpdateTenantSchema } from "./tenant.schema";

/**
 * Platform Admin tenant management routes.
 * Mounted at: /api/v1/admin/tenants
 */
export function buildAdminTenantRoutes(
  controller: AdminTenantController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  router.get("/", controller.list);
  router.get("/:id", controller.get);
  router.get("/:id/stats", controller.stats);
  router.patch("/:id", validate(adminUpdateTenantSchema), controller.update);

  return router;
}
