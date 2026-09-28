import { Router } from "express";
import type { TenantAuthController } from "./tenant-auth.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate } from "../../../shared/middleware/validate";
import {
  registerTenantOwnerSchema,
  loginSchema,
  selectTenantSchema,
  refreshTokensSchema,
  logoutSchema,
  createInviteSchema,
  acceptInviteSchema,
  forgotPasswordSchema,
  verifyForgotPasswordOtpSchema,
  resetPasswordSchema,
  changePasswordSchema,
  sendRegisterOtpSchema,
} from "./auth.schema";
import {
  loginLimiter,
  registerLimiter,
  otpRequestLimiter,
  otpCooldownLimiter,
} from "../../../shared/middleware/rate-limiters";

export function buildTenantAuthRoutes(
  controller: TenantAuthController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  // Public routes
  router.post(
    "/register/send-otp",
    otpCooldownLimiter, // Must wait 60s
    otpRequestLimiter, // Max 3 per 10 mins
    validate(sendRegisterOtpSchema),
    controller.sendRegisterOtp,
  );

  router.post(
    "/register",
    registerLimiter, // Max 5 creations per hour
    validate(registerTenantOwnerSchema),
    controller.register,
  );

  router.post(
    "/login",
    loginLimiter, // Max 10 per 15 mins
    validate(loginSchema),
    controller.login,
  );

  router.post(
    "/forgot-password",
    otpCooldownLimiter, // Must wait 60s
    otpRequestLimiter, // Max 3 per 10 mins
    validate(forgotPasswordSchema),
    controller.forgotPassword,
  );

  router.post(
    "/forgot-password/verify-otp",
    loginLimiter,
    validate(verifyForgotPasswordOtpSchema),
    controller.verifyForgotPasswordOtp,
  );

  router.post(
    "/reset-password",
    loginLimiter,
    validate(resetPasswordSchema),
    controller.resetPassword,
  );

  // Change password (authenticated — via profile)
  router.post(
    "/change-password",
    authenticate.any(),
    validate(changePasswordSchema),
    controller.changePassword,
  );

  // Authenticated routes
  router.post("/refresh", validate(refreshTokensSchema), controller.refresh);
  router.post("/logout", validate(logoutSchema), controller.logout);

  // Tenant-scoped routes
  router.post(
    "/select-tenant",
    authenticate.any(),
    validate(selectTenantSchema),
    controller.selectTenant,
  );
  router.get("/profile", authenticate.any(), controller.profile);

  router.post(
    "/invites",
    authenticate.tenant(),
    authorize.tenantRoles("OWNER", "ADMIN"),
    validate(createInviteSchema),
    controller.createInvite,
  );

  router.post(
    "/accept-invite",
    validate(acceptInviteSchema),
    controller.acceptInvite,
  );

  return router;
}
