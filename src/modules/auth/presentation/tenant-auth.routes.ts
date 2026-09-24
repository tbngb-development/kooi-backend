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

export function buildTenantAuthRoutes(
  controller: TenantAuthController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  // Public routes

  router.post(
    "/register/send-otp",
    validate(sendRegisterOtpSchema),
    controller.sendRegisterOtp,
  );

  router.post(
    "/register",
    validate(registerTenantOwnerSchema),
    controller.register,
  );
  router.post("/login", validate(loginSchema), controller.login);
  router.post(
    "/accept-invite",
    validate(acceptInviteSchema),
    controller.acceptInvite,
  );

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

  return router;
}
