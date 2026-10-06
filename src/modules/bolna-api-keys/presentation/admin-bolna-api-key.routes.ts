import { Router } from "express";
import type { AdminBolnaApiKeyController } from "./admin-bolna-api-key.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate, validateQuery } from "../../../shared/middleware/validate";
import {
  createBolnaApiKeySchema,
  assignKeySchema,
  updateBolnaApiKeySchema,
  listKeyTenantsQuerySchema,
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

  // ── Workspace Switching & Readiness Check ─────────────────────────
  router.get(
    "/switch-readiness",
    validateQuery(switchReadinessQuerySchema),
    controller.getReadiness,
  );

  router.get("/tenants/:tenantId/switch-status", controller.getStatus);

  // ── Bolna API Keys CRUD ──────────────────────────────────────────
  router.get("/", controller.list);
  router.post("/", validate(createBolnaApiKeySchema), controller.create);
  router.patch("/:id", validate(updateBolnaApiKeySchema), controller.update);

  // ── Assignment & Activation Lifecycle ────────────────────────────
  router.post("/:id/assign", validate(assignKeySchema), controller.assign);
  router.post("/:id/deactivate", controller.deactivate);
  router.post("/:id/activate", controller.activate);

  // ── Profile Sync & Tenant Affiliation ────────────────────────────
  router.post("/:id/refresh-profile", controller.refreshProfile);
  router.get(
    "/:id/tenants",
    validateQuery(listKeyTenantsQuerySchema),
    controller.listTenants,
  );

  return router;
}
