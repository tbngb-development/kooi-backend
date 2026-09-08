import type { AuthRepository } from "./application/interfaces/auth-repository.interface";
import type { TokenService } from "./application/interfaces/token-service.interface";
import type { PasswordService } from "./application/interfaces/password-service.interface";
import type { OtpService } from "./application/interfaces/otp-service.interface";
import type { PasswordResetTokenService } from "./application/interfaces/password-reset-token.service.interface";
import type { IEmailService } from "../../shared/config/external/email/email.interface";
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

export interface AuthModule {
  tenantController: TenantAuthController;
  adminController: AdminAuthController;
}

export interface AuthModuleDeps {
  authRepository: AuthRepository;
  tokenService: TokenService;
  passwordService: PasswordService;
  otpService: OtpService;
  passwordResetTokenService: PasswordResetTokenService;
  emailService: IEmailService;
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

  const loginUseCase = new LoginUseCase(
    authRepository,
    passwordService,
    tokenService,
  );

  const forgotPasswordUseCase = new ForgotPasswordUseCase(
    authRepository,
    otpService,
    emailService,
  );

  const verifyForgotPasswordOtpUseCase = new VerifyForgotPasswordOtpUseCase(
    authRepository,
    otpService,
    passwordResetTokenService,
  );

  const resetPasswordUseCase = new ResetPasswordUseCase(
    authRepository,
    passwordService,
    passwordResetTokenService,
  );

  const changePasswordUseCase = new ChangePasswordUseCase(
    authRepository,
    passwordService,
  );

  const logoutUsecase = new LogoutUseCase(authRepository, tokenService);

  return {
    tenantController: new TenantAuthController(
      new RegisterTenantOwnerUseCase(
        authRepository,
        passwordService,
        tokenService,
      ),
      loginUseCase,
      new SelectTenantUseCase(authRepository, tokenService),
      new RefreshTokensUseCase(authRepository, tokenService),
      new GetProfileUseCase(authRepository),
      new CreateInviteUseCase(tokenService),
      new AcceptInviteUseCase(authRepository, passwordService, tokenService),
      logoutUsecase,
      forgotPasswordUseCase,
      verifyForgotPasswordOtpUseCase,
      resetPasswordUseCase,
      changePasswordUseCase,
    ),

    adminController: new AdminAuthController(
      loginUseCase,
      logoutUsecase,
      forgotPasswordUseCase,
      verifyForgotPasswordOtpUseCase,
      resetPasswordUseCase,
      changePasswordUseCase,
    ),
  };
}
