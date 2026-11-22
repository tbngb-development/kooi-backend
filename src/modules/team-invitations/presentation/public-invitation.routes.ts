import { Router, type RequestHandler } from "express";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import { validate, validateQuery } from "../../../shared/middleware/validate";
import type { PublicInvitationController } from "./public-invitation.controller";
import {
  acceptInvitationSchema,
  previewInvitationQuerySchema,
} from "./invitation.schema";

/**
 * Public invite link endpoints. Auth is optional so an existing member can
 * accept while logged in; both endpoints are rate-limited and validated.
 */
export function buildPublicInvitationRoutes(
  controller: PublicInvitationController,
  authenticate: AuthenticateMiddleware,
  previewLimiter: RequestHandler,
  acceptLimiter: RequestHandler,
): Router {
  const router = Router();

  router.use(authenticate.optional());

  router.get(
    "/preview",
    previewLimiter,
    validateQuery(previewInvitationQuerySchema),
    controller.preview,
  );
  router.post(
    "/accept",
    acceptLimiter,
    validate(acceptInvitationSchema),
    controller.accept,
  );

  return router;
}
