import type { Router } from "express";
import { buildTenantContactRoutes } from "./tenant-contact.routes";
import type { TenantContactController } from "./tenant-contact.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";

export { buildTenantContactRoutes } from "./tenant-contact.routes";

/**
 * Backward-compatibility wrapper for contact routes.
 */
export function buildContactRoutes(
  tenantController: TenantContactController,
  authenticate: AuthenticateMiddleware,
): Router {
  return buildTenantContactRoutes(tenantController, authenticate);
}
