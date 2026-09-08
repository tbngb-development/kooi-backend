import { Router } from "express";
import type { AdminAuthController } from "./admin-auth.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import { validate } from "../../../shared/middleware/validate";
import {
  adminLoginSchema,
  forgotPasswordSchema,
  verifyForgotPasswordOtpSchema,
  resetPasswordSchema,
  changePasswordSchema,
  logoutSchema,
} from "./auth.schema";

export function buildAdminAuthRoutes(
  controller: AdminAuthController,
  authenticate: AuthenticateMiddleware,
): Router {
  const router = Router();

  // Public admin auth routes
  router.post("/login", validate(adminLoginSchema), controller.login);
  router.post(
    "/forgot-password",
    validate(forgotPasswordSchema),
    controller.forgotPassword,
  );
  router.post(
    "/forgot-password/verify-otp",
    validate(verifyForgotPasswordOtpSchema),
    controller.verifyForgotPasswordOtp,
  );
  router.post(
    "/reset-password",
    validate(resetPasswordSchema),
    controller.resetPassword,
  );

  // Authenticated platform-admin route
  router.post(
    "/change-password",
    authenticate.admin(),
    validate(changePasswordSchema),
    controller.changePassword,
  );

  router.post(
    "/logout",
    validate(logoutSchema),
    authenticate.admin(),
    controller.logout,
  );

  return router;
}
