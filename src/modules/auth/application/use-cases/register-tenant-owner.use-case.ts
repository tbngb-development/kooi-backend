import { ValidationError } from "../../../../shared/errors";
import type {
  RegisterTenantOwnerInput,
  RegisterTenantOwnerOutput,
} from "../dto/register.dto";
import { type AuthRepository } from "../interfaces/auth-repository.interface";
import { type PasswordService } from "../interfaces/password-service.interface";
import { type TokenService } from "../interfaces/token-service.interface";
import { type OtpService } from "../interfaces/otp-service.interface";
import {
  EmailAlreadyExistsError,
  InvalidOtpError,
  OtpMaxAttemptsError,
} from "../../domain/errors/auth.errors";
import { validatePasswordStrength } from "../../domain/rules/password.rules";
import type { Logger } from "../../../../shared/logging/logger.interface";

const OTP_PURPOSE = "register";

export class RegisterTenantOwnerUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly otpService: OtpService,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: RegisterTenantOwnerInput,
  ): Promise<RegisterTenantOwnerOutput> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // 1. Verify OTP first (prevents resource consumption on incorrect codes)
    const verification = await this.otpService.verify(
      OTP_PURPOSE,
      normalizedEmail,
      input.otp,
    );

    if (verification.maxAttemptsExceeded) {
      this.logger.warn("Registration OTP max attempts exceeded", {
        action: "register.tenant_owner",
        email: normalizedEmail,
      });
      throw new OtpMaxAttemptsError();
    }
    if (!verification.valid) {
      this.logger.warn("Registration OTP invalid", {
        action: "register.tenant_owner",
        email: normalizedEmail,
      });
      throw new InvalidOtpError();
    }

    // 2. Validate password strength
    const passwordValidation = validatePasswordStrength(input.password);
    if (!passwordValidation.isValid) {
      throw new ValidationError(
        passwordValidation.errors.map((msg) => ({
          field: "password",
          message: msg,
        })),
      );
    }

    // 3. Check existing user
    const existingUser =
      await this.authRepository.findUserByEmail(normalizedEmail);
    if (existingUser) {
      this.logger.warn("Registration failed — email already exists", {
        action: "register.tenant_owner",
        email: normalizedEmail,
      });
      throw new EmailAlreadyExistsError();
    }

    // 4. Hash password
    const passwordHash = await this.passwordService.hash(input.password);

    // 5. Create tenant + user + membership in transaction
    const result = await this.authRepository.registerTenantOwner({
      tenantName: input.tenantName,
      tenantEmail: normalizedEmail,
      userEmail: normalizedEmail,
      userName: input.name,
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      termsVersion: input.termsVersion,
      passwordHash,
    });

    // 6. Generate tokens
    const accessToken = this.tokenService.generateAccessToken({
      userId: result.user.id,
      membershipId: result.membershipId,
      tenantId: result.tenantId,
      tenantRole: "OWNER",
      isPlatformAdmin: result.user.isPlatformAdmin,
    });

    const refreshTokenData = this.tokenService.generateRefreshToken(
      result.user.id,
    );

    await this.authRepository.saveRefreshToken({
      tokenHash: refreshTokenData.tokenHash,
      userId: result.user.id,
      familyId: refreshTokenData.familyId,
      expiresAt: new Date(Date.now() + refreshTokenData.expiresIn * 1000),
    });

    this.logger.info("Tenant owner registered", {
      action: "register.tenant_owner",
      userId: result.user.id,
      tenantId: result.tenantId,
      membershipId: result.membershipId,
    });

    return {
      accessToken,
      refreshToken: refreshTokenData.rawToken,
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: refreshTokenData.expiresIn,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      tenant: {
        id: result.tenantId,
        name: input.tenantName,
      },
      membership: {
        id: result.membershipId,
        role: "OWNER",
      },
    };
  }
}
