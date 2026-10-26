import { describe, it, expect, vi, beforeEach } from "vitest";
import { SendTenantMobileOtpUseCase, TENANT_MOBILE_OTP_PURPOSE } from "../application/use-cases/send-tenant-mobile-otp.use-case";
import { VerifyTenantMobileOtpUseCase } from "../application/use-cases/verify-tenant-mobile-otp.use-case";
import { EnforceTenantVerificationMiddleware } from "../../../shared/middleware/enforce-tenant-verification";
import {
  TenantNotFoundError,
  TenantAlreadyVerifiedError,
  VerificationCooldownActiveError,
  InvalidVerificationOtpError,
  VerificationOtpMaxAttemptsError,
  TenantVerificationRequiredError,
} from "../domain/tenant.errors";
import type { TenantRepository, TenantWithCounts } from "../application/interfaces/tenant-repository.interface";
import type { OtpService } from "../../auth/application/interfaces/otp-service.interface";
import type { IEmailService } from "../../../shared/config/external/email/email.interface";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type Redis from "ioredis";
import type { Request, Response } from "express";

describe("Tenant Identity Verification", () => {
  let mockTenantRepo: TenantRepository;
  let mockOtpService: OtpService;
  let mockEmailService: IEmailService;
  let mockRedis: Partial<Redis>;
  let mockLogger: any;
  let mockPlanRepo: PlanRepository;

  const sampleTenant: TenantWithCounts = {
    id: "tenant-123",
    name: "Acme Corp",
    email: "owner@acme.com",
    isActive: true,
    isVerified: false,
    phone: null,
    verifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { memberships: 1, campaigns: 0, leads: 0, calls: 0 },
  };

  beforeEach(() => {
    mockTenantRepo = {
      findById: vi.fn().mockResolvedValue({ ...sampleTenant }),
      update: vi.fn().mockImplementation((id, data) =>
        Promise.resolve({ ...sampleTenant, ...data }),
      ),
      list: vi.fn(),
      getStats: vi.fn(),
    };

    mockOtpService = {
      generateAndStore: vi.fn().mockResolvedValue("123456"),
      verify: vi.fn().mockResolvedValue({
        valid: true,
        attemptsRemaining: 3,
        maxAttemptsExceeded: false,
      }),
      invalidate: vi.fn().mockResolvedValue(undefined),
    };

    mockEmailService = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    mockRedis = {
      ttl: vi.fn().mockResolvedValue(-2),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };

    mockPlanRepo = {
      getActivePlanForTenant: vi.fn(),
    } as any;
  });

  describe("SendTenantMobileOtpUseCase", () => {
    it("successfully generates OTP, sets cooldown, and sends verification email", async () => {
      const useCase = new SendTenantMobileOtpUseCase(
        mockTenantRepo,
        mockOtpService,
        mockEmailService,
        mockRedis as Redis,
        mockLogger,
      );

      const result = await useCase.execute({
        tenantId: "tenant-123",
        phone: "+919876543210",
      });

      expect(result.message).toContain("owner@acme.com");
      expect(result.cooldownSeconds).toBe(60);
      expect(mockOtpService.generateAndStore).toHaveBeenCalledWith(
        TENANT_MOBILE_OTP_PURPOSE,
        "tenant-123:+919876543210",
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        "otp:cooldown:tenant_mobile:tenant-123",
        "1",
        "EX",
        60,
      );
      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "owner@acme.com",
          subject: expect.stringContaining("Acme Corp"),
        }),
      );
    });

    it("throws TenantNotFoundError if tenant does not exist", async () => {
      vi.mocked(mockTenantRepo.findById).mockResolvedValue(null);

      const useCase = new SendTenantMobileOtpUseCase(
        mockTenantRepo,
        mockOtpService,
        mockEmailService,
        mockRedis as Redis,
        mockLogger,
      );

      await expect(
        useCase.execute({ tenantId: "missing-id", phone: "+919876543210" }),
      ).rejects.toThrow(TenantNotFoundError);
    });

    it("throws TenantAlreadyVerifiedError if tenant is already verified", async () => {
      vi.mocked(mockTenantRepo.findById).mockResolvedValue({
        ...sampleTenant,
        isVerified: true,
        phone: "+919876543210",
      });

      const useCase = new SendTenantMobileOtpUseCase(
        mockTenantRepo,
        mockOtpService,
        mockEmailService,
        mockRedis as Redis,
        mockLogger,
      );

      await expect(
        useCase.execute({ tenantId: "tenant-123", phone: "+919876543210" }),
      ).rejects.toThrow(TenantAlreadyVerifiedError);
    });

    it("throws VerificationCooldownActiveError if 60s cooldown is still running", async () => {
      vi.mocked(mockRedis.ttl!).mockResolvedValue(42);

      const useCase = new SendTenantMobileOtpUseCase(
        mockTenantRepo,
        mockOtpService,
        mockEmailService,
        mockRedis as Redis,
        mockLogger,
      );

      await expect(
        useCase.execute({ tenantId: "tenant-123", phone: "+919876543210" }),
      ).rejects.toThrow(VerificationCooldownActiveError);

      expect(mockOtpService.generateAndStore).not.toHaveBeenCalled();
    });
  });

  describe("VerifyTenantMobileOtpUseCase", () => {
    it("successfully verifies OTP, updates tenant to isVerified = true, and clears cooldown", async () => {
      const useCase = new VerifyTenantMobileOtpUseCase(
        mockTenantRepo,
        mockOtpService,
        mockRedis as Redis,
        mockLogger,
      );

      // On first call returns unverified, on second call returns updated
      vi.mocked(mockTenantRepo.findById)
        .mockResolvedValueOnce({ ...sampleTenant, isVerified: false })
        .mockResolvedValueOnce({
          ...sampleTenant,
          isVerified: true,
          phone: "+919876543210",
          verifiedAt: new Date(),
        });

      const result = await useCase.execute({
        tenantId: "tenant-123",
        phone: "+919876543210",
        otp: "123456",
      });

      expect(result.tenant.isVerified).toBe(true);
      expect(mockOtpService.verify).toHaveBeenCalledWith(
        TENANT_MOBILE_OTP_PURPOSE,
        "tenant-123:+919876543210",
        "123456",
      );
      expect(mockTenantRepo.update).toHaveBeenCalledWith("tenant-123", {
        isVerified: true,
        phone: "+919876543210",
        verifiedAt: expect.any(Date),
      });
      expect(mockRedis.del).toHaveBeenCalledWith(
        "otp:cooldown:tenant_mobile:tenant-123",
      );
    });

    it("throws InvalidVerificationOtpError on wrong OTP", async () => {
      vi.mocked(mockOtpService.verify).mockResolvedValue({
        valid: false,
        attemptsRemaining: 2,
        maxAttemptsExceeded: false,
      });

      const useCase = new VerifyTenantMobileOtpUseCase(
        mockTenantRepo,
        mockOtpService,
        mockRedis as Redis,
        mockLogger,
      );

      await expect(
        useCase.execute({
          tenantId: "tenant-123",
          phone: "+919876543210",
          otp: "000000",
        }),
      ).rejects.toThrow(InvalidVerificationOtpError);

      expect(mockTenantRepo.update).not.toHaveBeenCalled();
    });

    it("throws VerificationOtpMaxAttemptsError when maximum attempts are exceeded", async () => {
      vi.mocked(mockOtpService.verify).mockResolvedValue({
        valid: false,
        attemptsRemaining: 0,
        maxAttemptsExceeded: true,
      });

      const useCase = new VerifyTenantMobileOtpUseCase(
        mockTenantRepo,
        mockOtpService,
        mockRedis as Redis,
        mockLogger,
      );

      await expect(
        useCase.execute({
          tenantId: "tenant-123",
          phone: "+919876543210",
          otp: "999999",
        }),
      ).rejects.toThrow(VerificationOtpMaxAttemptsError);
    });
  });

  describe("EnforceTenantVerificationMiddleware", () => {
    it("allows request if tenant is on a paid plan even if unverified", async () => {
      vi.mocked(mockPlanRepo.getActivePlanForTenant).mockResolvedValue({
        id: "plan-1",
        name: "Enterprise",
        isTrial: false,
      } as any);

      const middleware = new EnforceTenantVerificationMiddleware(
        mockPlanRepo,
        mockTenantRepo,
        mockLogger,
      );

      const req = {
        user: { tenantId: "tenant-123", type: "tenant" },
        originalUrl: "/api/v1/campaigns/c1/parse-leads",
        method: "POST",
      } as unknown as Request;

      const res = {} as Response;
      const next = vi.fn();

      await middleware.check()(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(mockTenantRepo.findById).not.toHaveBeenCalled();
    });

    it("allows request if tenant is on a trial plan AND verified", async () => {
      vi.mocked(mockPlanRepo.getActivePlanForTenant).mockResolvedValue({
        id: "plan-trial",
        name: "Free Trial",
        isTrial: true,
      } as any);

      vi.mocked(mockTenantRepo.findById).mockResolvedValue({
        ...sampleTenant,
        isVerified: true,
        phone: "+919876543210",
      });

      const middleware = new EnforceTenantVerificationMiddleware(
        mockPlanRepo,
        mockTenantRepo,
        mockLogger,
      );

      const req = {
        user: { tenantId: "tenant-123", type: "tenant" },
        originalUrl: "/api/v1/campaigns/c1/batches",
        method: "POST",
      } as unknown as Request;

      const res = {} as Response;
      const next = vi.fn();

      await middleware.check()(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it("blocks request and throws TenantVerificationRequiredError if tenant is on trial plan and unverified", async () => {
      vi.mocked(mockPlanRepo.getActivePlanForTenant).mockResolvedValue({
        id: "plan-trial",
        name: "Free Trial",
        isTrial: true,
      } as any);

      vi.mocked(mockTenantRepo.findById).mockResolvedValue({
        ...sampleTenant,
        isVerified: false,
      });

      const middleware = new EnforceTenantVerificationMiddleware(
        mockPlanRepo,
        mockTenantRepo,
        mockLogger,
      );

      const req = {
        user: { tenantId: "tenant-123", type: "tenant" },
        originalUrl: "/api/v1/campaigns/c1/parse-leads",
        method: "POST",
      } as unknown as Request;

      const res = {} as Response;
      const next = vi.fn();

      await middleware.check()(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(TenantVerificationRequiredError),
      );
    });
  });
});
