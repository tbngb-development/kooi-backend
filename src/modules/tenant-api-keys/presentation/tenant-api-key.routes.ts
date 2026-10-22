import { Router } from "express";
import type { TenantApiKeyController } from "./tenant-api-key.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validateQuery } from "../../../shared/middleware/validate";
import { listTenantApiKeysQuerySchema } from "./tenant-api-key.schema";

/**
 * Tenant-scoped routes for external API key management.
 * Mounted at: /v1/api-keys
 */
export function buildTenantApiKeyRoutes(
  controller: TenantApiKeyController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  // All API key management routes require active tenant session and OWNER or ADMIN role
  router.use(authenticate.tenant());
  router.use(authorize.tenantRoles("OWNER", "ADMIN"));

  router.post("/", controller.create);
  router.get("/", validateQuery(listTenantApiKeysQuerySchema), controller.list);
  router.delete("/:id", controller.delete);

  return router;
}
