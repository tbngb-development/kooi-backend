import type { AuthRepository } from "./application/interfaces/auth-repository.interface";
import type { TokenService } from "./application/interfaces/token-service.interface";
import type { PasswordService } from "./application/interfaces/password-service.interface";
import type { OtpService } from "./application/interfaces/otp-service.interface";
import type { PasswordResetTokenService } from "./application/interfaces/password-reset-token.service.interface";
import type { IEmailService } from "../../shared/config/external/email/email.interface";
import type { Logger } from "../../shared/logging/logger.interface";

import { RegisterTenantOwnerUseCase } from "./application/use-cases/register-tenant-owner.use-case";
import { LoginUseCase } from "./application/use-cases/login.use-case";
import { SelectTenantUseCase } from "./application/use-cases/select-tenant.use-case";
import { RefreshTokensUseCase } from "./application/use-cases/refresh-tokens.use-case";
import { GetProfileUseCase } from "./application/use-cases/get-profile.use-case";
import { CreateInviteUseCase } from "./application/use-cases/create-invite.use-case";
import { AcceptInviteUseCase } from "./application/use-cases/accept-invite.use-case";
import { LogoutUseCase } from "./application/use-cases/logout.use-case";
import { ForgotPasswordUseCase } from "./application/use-cases/forgot-password.use-case";
import { VerifyForgotPasswordOtpUseCase } from "./application/use-cases/verify-forgot-password-otp.use-case";
import { ResetPasswordUseCase } from "./application/use-cases/reset-password.use-case";
import { ChangePasswordUseCase } from "./application/use-cases/change-password.use-case";
import { TenantAuthController } from "./presentation/tenant-auth.controller";
import { AdminAuthController } from "./presentation/admin-auth.controller";
import { SendRegisterOtpUseCase } from "./application/use-cases/send-register-otp.use-case";
import { AdminLoginUseCase } from "./application/use-cases/admin-login.use-case";
import { RevokeAllSessionsUseCase } from "./application/use-cases/revoke-all-sessions.use-case";
import { RefreshTokenCleanupService } from "./infrastructure/services/refresh-token-cleanup.service";
import { RefreshTokenCleanupScheduler } from "./infrastructure/jobs/refresh-token-cleanup.scheduler";

export interface AuthModule {
  tenantController: TenantAuthController;
  adminController: AdminAuthController;
  schedulers: {
    refreshTokenCleanup: RefreshTokenCleanupScheduler;
  };
}

export interface AuthModuleDeps {
  authRepository: AuthRepository;
  tokenService: TokenService;
  passwordService: PasswordService;
  otpService: OtpService;
  passwordResetTokenService: PasswordResetTokenService;
  emailService: IEmailService;
  logger: Logger;
}

export function buildAuthModule(deps: AuthModuleDeps): AuthModule {
  const {
    authRepository,
    tokenService,
    passwordService,
    otpService,
    passwordResetTokenService,
    emailService,
  } = deps;

  const log = deps.logger.child({ module: "auth" });

  const adminLoginUseCase = new AdminLoginUseCase(
    authRepository,
    passwordService,
    tokenService,
    log,
  );
  const loginUseCase = new LoginUseCase(
    authRepository,
    passwordService,
    tokenService,
    log,
  );

  const forgotPasswordUseCase = new ForgotPasswordUseCase(
    authRepository,
    otpService,
    emailService,
    log,
  );

  const verifyForgotPasswordOtpUseCase = new VerifyForgotPasswordOtpUseCase(
    authRepository,
    otpService,
    passwordResetTokenService,
    log,
  );

  const resetPasswordUseCase = new ResetPasswordUseCase(
    authRepository,
    passwordService,
    passwordResetTokenService,
    log,
  );

  const changePasswordUseCase = new ChangePasswordUseCase(
    authRepository,
    passwordService,
    log,
  );

  const logoutUsecase = new LogoutUseCase(authRepository, tokenService, log);

  const revokeAllSessions = new RevokeAllSessionsUseCase(authRepository, log);
  const cleanupService = new RefreshTokenCleanupService(authRepository, log);
  const refreshTokenCleanupScheduler = new RefreshTokenCleanupScheduler(
    cleanupService,
    log,
  );

  return {
    tenantController: new TenantAuthController(
      new RegisterTenantOwnerUseCase(
        authRepository,
        passwordService,
        tokenService,
        otpService,
        log,
      ),
      loginUseCase,
      new SelectTenantUseCase(authRepository, tokenService, log),
      new RefreshTokensUseCase(authRepository, tokenService, log),
      new GetProfileUseCase(authRepository),
      new CreateInviteUseCase(tokenService, log),
      new AcceptInviteUseCase(
        authRepository,
        passwordService,
        tokenService,
        log,
      ),
      logoutUsecase,
      forgotPasswordUseCase,
      verifyForgotPasswordOtpUseCase,
      resetPasswordUseCase,
      changePasswordUseCase,
      new SendRegisterOtpUseCase(authRepository, otpService, emailService, log),
      revokeAllSessions,
    ),

    adminController: new AdminAuthController(
      adminLoginUseCase,
      logoutUsecase,
      forgotPasswordUseCase,
      verifyForgotPasswordOtpUseCase,
      resetPasswordUseCase,
      changePasswordUseCase,
    ),

    schedulers: {
      refreshTokenCleanup: refreshTokenCleanupScheduler,
    },
  };
}
