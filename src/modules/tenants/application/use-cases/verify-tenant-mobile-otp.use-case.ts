import type Redis from "ioredis";
import type {
  TenantRepository,
  TenantWithCounts,
} from "../interfaces/tenant-repository.interface";
import type { OtpService } from "../../../auth/application/interfaces/otp-service.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";
import {
  TenantNotFoundError,
  TenantAlreadyVerifiedError,
  InvalidVerificationOtpError,
  VerificationOtpMaxAttemptsError,
} from "../../domain/tenant.errors";
import { TENANT_MOBILE_OTP_PURPOSE } from "./send-tenant-mobile-otp.use-case";

export interface VerifyTenantMobileOtpInput {
  tenantId: string;
  phone: string;
  otp: string;
}

export interface VerifyTenantMobileOtpOutput {
  tenant: TenantWithCounts;
}

export class VerifyTenantMobileOtpUseCase {
  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly otpService: OtpService,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: VerifyTenantMobileOtpInput,
  ): Promise<VerifyTenantMobileOtpOutput> {
    const { tenantId } = input;
    const normalizedPhone = input.phone.trim();
    const cleanOtp = input.otp.trim();

    // 1. Fetch tenant
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new TenantNotFoundError();
    }

    if (tenant.isVerified) {
      throw new TenantAlreadyVerifiedError();
    }

    // 2. Verify OTP
    const identifier = `${tenantId}:${normalizedPhone}`;
    const result = await this.otpService.verify(
      TENANT_MOBILE_OTP_PURPOSE,
      identifier,
      cleanOtp,
    );

    if (result.maxAttemptsExceeded) {
      this.logger.warn("Tenant verification max attempts exceeded", {
        action: "tenant_verification.verify_otp",
        tenantId,
        phone: normalizedPhone,
      });
      throw new VerificationOtpMaxAttemptsError();
    }

    if (!result.valid) {
      this.logger.warn("Invalid tenant verification OTP provided", {
        action: "tenant_verification.verify_otp",
        tenantId,
        phone: normalizedPhone,
        attemptsRemaining: result.attemptsRemaining,
      });
      throw new InvalidVerificationOtpError(result.attemptsRemaining);
    }

    // 3. Mark tenant as verified
    await this.tenantRepository.update(tenantId, {
      isVerified: true,
      phone: normalizedPhone,
      verifiedAt: new Date(),
    });

    // 4. Clean up cooldown key in Redis
    await this.redis.del(`otp:cooldown:tenant_mobile:${tenantId}`);

    // 5. Fetch updated tenant with counts
    const updatedTenant = await this.tenantRepository.findById(tenantId);
    if (!updatedTenant) {
      throw new TenantNotFoundError();
    }

    this.logger.info("Tenant successfully verified mobile identity", {
      action: "tenant_verification.success",
      tenantId,
      phone: normalizedPhone,
    });

    return { tenant: updatedTenant };
  }
}
