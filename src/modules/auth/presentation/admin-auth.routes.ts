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
import {
  adminLoginLimiter,
  otpRequestLimiter,
  otpCooldownLimiter,
} from "../../../shared/middleware/rate-limiters";

export function buildAdminAuthRoutes(
  controller: AdminAuthController,
  authenticate: AuthenticateMiddleware,
): Router {
  const router = Router();

  // Public admin auth routes
  router.post(
    "/login",
    adminLoginLimiter,
    validate(adminLoginSchema),
    controller.login,
  );

  // Email-bombing & cooldown limiters placed before business logic
  router.post(
    "/forgot-password",
    otpCooldownLimiter, // Must wait 60s
    otpRequestLimiter, // Max 3 per 10 mins
    validate(forgotPasswordSchema),
    controller.forgotPassword,
  );

  router.post(
    "/forgot-password/verify-otp",
    adminLoginLimiter, // Reuses the strict login limiter window for brute-forcing OTPs
    validate(verifyForgotPasswordOtpSchema),
    controller.verifyForgotPasswordOtp,
  );

  router.post(
    "/reset-password",
    adminLoginLimiter,
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
