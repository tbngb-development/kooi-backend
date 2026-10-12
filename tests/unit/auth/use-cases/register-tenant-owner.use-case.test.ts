import { describe, it, expect, vi, beforeEach } from "vitest";
import { RegisterTenantOwnerUseCase } from "../../../../src/modules/auth/application/use-cases/register-tenant-owner.use-case";
import {
  EmailAlreadyExistsError,
  InvalidOtpError,
  OtpMaxAttemptsError,
} from "../../../../src/modules/auth/domain/errors/auth.errors";
import { ValidationError } from "../../../../src/shared/errors/validation.error";
import type { AuthRepository } from "../../../../src/modules/auth/application/interfaces/auth-repository.interface";
import type { PasswordService } from "../../../../src/modules/auth/application/interfaces/password-service.interface";
import type { TokenService } from "../../../../src/modules/auth/application/interfaces/token-service.interface";
import type { OtpService } from "../../../../src/modules/auth/application/interfaces/otp-service.interface";
import type { Logger } from "../../../../src/shared/logging/logger.interface";

describe("RegisterTenantOwnerUseCase (Module 2)", () => {
  let authRepository: AuthRepository;
  let passwordService: PasswordService;
  let tokenService: TokenService;
  let otpService: OtpService;
  let logger: Logger;
  let useCase: RegisterTenantOwnerUseCase;

  const validRegistrationPayload = {
    tenantName: "Nova Enterprises",
    email: "owner@nova.com",
    password: "StrongPassword@123",
    name: "John Doe",
    termsAccepted: true as const,
    termsVersion: "v1.0",
    otp: "123456",
  };

  beforeEach(() => {
    authRepository = {
      findUserByEmail: vi.fn().mockResolvedValue(null),
      findUserById: vi.fn(),
      registerTenantOwner: vi.fn().mockResolvedValue({
        user: {
          id: "new-user-1",
          email: "owner@nova.com",
          name: "John Doe",
          isActive: true,
          isPlatformAdmin: false,
        },
        tenantId: "new-tenant-1",
        membershipId: "new-mem-1",
      }),
      registerMember: vi.fn(),
      findMembership: vi.fn(),
      createMembership: vi.fn(),
      checkMembershipExists: vi.fn(),
      checkTenantActive: vi.fn(),
      saveRefreshToken: vi.fn().mockResolvedValue("token-1"),
      findRefreshToken: vi.fn(),
      revokeRefreshToken: vi.fn(),
      revokeRefreshTokenFamily: vi.fn(),
      revokeAllUserRefreshTokens: vi.fn(),
      cleanupExpiredRefreshTokens: vi.fn(),
      cleanupOrphanedAndExpiredTokenFamilies: vi.fn(),
      updateUserPassword: vi.fn(),
    };

    passwordService = {
      hash: vi.fn().mockResolvedValue("hashed-password"),
      compare: vi.fn(),
    };

    tokenService = {
      generateAccessToken: vi.fn().mockReturnValue("mock-access-token"),
      generateBaseAccessToken: vi.fn(),
      generateAdminAccessToken: vi.fn(),
      generateRefreshToken: vi.fn().mockReturnValue({
        rawToken: "mock-refresh-token",
        tokenHash: "mock-hash",
        familyId: "mock-family-1",
        expiresIn: 604800,
      }),
      generateRefreshTokenForFamily: vi.fn(),
      generateInviteToken: vi.fn(),
      verifyAccessToken: vi.fn(),
      verifyRefreshToken: vi.fn(),
      verifyInviteToken: vi.fn(),
      hashToken: vi.fn(),
    };

    otpService = {
      generateAndStore: vi.fn(),
      verify: vi.fn().mockResolvedValue({
        valid: true,
        attemptsRemaining: 2,
        maxAttemptsExceeded: false,
      }),
      invalidate: vi.fn(),
    };

    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };

    useCase = new RegisterTenantOwnerUseCase(
      authRepository,
      passwordService,
      tokenService,
      otpService,
      logger,
    );
  });

  it("successfully registers tenant owner when OTP and payload are valid", async () => {
    const result = await useCase.execute(validRegistrationPayload);

    expect(result.user.email).toBe("owner@nova.com");
    expect(result.tenant.id).toBe("new-tenant-1");
    expect(result.membership.role).toBe("OWNER");
    expect(result.accessToken).toBe("mock-access-token");
    expect(result.refreshToken).toBe("mock-refresh-token");

    expect(otpService.verify).toHaveBeenCalledWith(
      "register",
      "owner@nova.com",
      "123456",
    );
    expect(authRepository.registerTenantOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantName: "Nova Enterprises",
        userEmail: "owner@nova.com",
        passwordHash: "hashed-password",
        termsAccepted: true,
      }),
    );
  });

  it("rejects registration when OTP is invalid", async () => {
    (otpService.verify as any).mockResolvedValue({
      valid: false,
      attemptsRemaining: 1,
      maxAttemptsExceeded: false,
    });

    await expect(useCase.execute(validRegistrationPayload)).rejects.toThrow(
      InvalidOtpError,
    );
  });

  it("rejects registration when OTP max attempts is exceeded", async () => {
    (otpService.verify as any).mockResolvedValue({
      valid: false,
      attemptsRemaining: 0,
      maxAttemptsExceeded: true,
    });

    await expect(useCase.execute(validRegistrationPayload)).rejects.toThrow(
      OtpMaxAttemptsError,
    );
  });

  it("rejects registration when password fails complexity requirements", async () => {
    await expect(
      useCase.execute({
        ...validRegistrationPayload,
        password: "weak", // Missing numbers, uppercase, length < 8
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects registration when email already exists", async () => {
    (authRepository.findUserByEmail as any).mockResolvedValue({
      id: "existing-user",
      email: "owner@nova.com",
    });

    await expect(useCase.execute(validRegistrationPayload)).rejects.toThrow(
      EmailAlreadyExistsError,
    );
  });
});
