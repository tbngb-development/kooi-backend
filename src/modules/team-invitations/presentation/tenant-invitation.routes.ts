import { Router, type RequestHandler } from "express";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate, validateQuery } from "../../../shared/middleware/validate";
import type { TenantInvitationController } from "./tenant-invitation.controller";
import {
  createInvitationSchema,
  listInvitationsQuerySchema,
} from "./invitation.schema";

/**
 * Tenant-scoped invitation management, mounted under `/v1/tenants/current`.
 *
 * Guards are applied per route (not with `router.use`) so unrelated workspace
 * routes such as `GET /current` still fall through to the general workspace
 * router. The OWNER/ADMIN guard is a coarse boundary; the service applies the
 * finer rule (ADMIN may only grant USER) inside the tenant lock.
 */
export function buildTenantInvitationRoutes(
  controller: TenantInvitationController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
  writeLimiter: RequestHandler,
): Router {
  const router = Router();
  const guard: RequestHandler[] = [
    authenticate.tenant(),
    authorize.tenantRoles("OWNER", "ADMIN"),
  ];

  router.get("/seats", ...guard, controller.seats);

  router.post(
    "/invitations",
    ...guard,
    writeLimiter,
    validate(createInvitationSchema),
    controller.create,
  );
  router.get(
    "/invitations",
    ...guard,
    validateQuery(listInvitationsQuerySchema),
    controller.list,
  );
  router.post(
    "/invitations/:id/resend",
    ...guard,
    writeLimiter,
    controller.resend,
  );
  router.delete("/invitations/:id", ...guard, writeLimiter, controller.revoke);

  return router;
}
