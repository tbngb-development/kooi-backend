import { Router } from "express";
import type { AdminInviteController } from "./admin-invite.controller";
import type { PublicInviteController } from "./public-invite.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate } from "../../../shared/middleware/validate";
import {
  createOwnerInviteSchema,
  acceptOwnerInviteSchema,
} from "./invite-schema"; // or invite.schema.ts — use your real filename

export function buildAdminInviteRoutes(
  controller: AdminInviteController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  router.post("/", validate(createOwnerInviteSchema), controller.create);
  router.get("/", controller.list);
  router.post("/:id/resend", controller.resend);
  router.post("/:id/revoke", controller.revoke);

  return router;
}

export function buildPublicInviteRoutes(
  controller: PublicInviteController,
): Router {
  const router = Router();

  router.get("/:token", controller.get);
  router.post("/accept", validate(acceptOwnerInviteSchema), controller.accept);
  // NO resend/revoke here

  return router;
}
