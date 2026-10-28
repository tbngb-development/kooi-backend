import type Redis from "ioredis";
import type { TenantRepository } from "../interfaces/tenant-repository.interface";
import type { OtpService } from "../../../auth/application/interfaces/otp-service.interface";
import type { IEmailService } from "../../../../shared/config/external/email/email.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";
import {
  TenantNotFoundError,
  TenantAlreadyVerifiedError,
  VerificationCooldownActiveError,
} from "../../domain/tenant.errors";
import { tenantMobileVerificationTemplate } from "../../../../shared/config/external/email/templates/tenant-mobile-verification.template";

export const TENANT_MOBILE_OTP_PURPOSE = "tenant_mobile_verification";
const OTP_TTL_MINUTES = 5;
const COOLDOWN_SECONDS = 60;

export interface SendTenantMobileOtpInput {
  tenantId: string;
  phone: string;
}

export interface SendTenantMobileOtpOutput {
  message: string;
  cooldownSeconds: number;
}

export class SendTenantMobileOtpUseCase {
  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly otpService: OtpService,
    private readonly emailService: IEmailService,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: SendTenantMobileOtpInput,
  ): Promise<SendTenantMobileOtpOutput> {
    const { tenantId } = input;
    const normalizedPhone = input.phone.trim();

    // 1. Fetch tenant
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new TenantNotFoundError();
    }

    if (tenant.isVerified) {
      throw new TenantAlreadyVerifiedError();
    }

    // 2. Check cooldown in Redis
    const cooldownKey = `otp:cooldown:tenant_mobile:${tenantId}`;
    const ttlRemaining = await this.redis.ttl(cooldownKey);
    if (ttlRemaining > 0) {
      this.logger.warn("Tenant verification OTP requested during cooldown", {
        action: "tenant_verification.send_otp",
        tenantId,
        ttlRemaining,
      });
      throw new VerificationCooldownActiveError();
    }

    // 3. Generate and store OTP in Redis (5 min TTL)
    const identifier = `${tenantId}:${normalizedPhone}`;
    const otp = await this.otpService.generateAndStore(
      TENANT_MOBILE_OTP_PURPOSE,
      identifier,
    );

    // 4. Set cooldown in Redis
    await this.redis.set(cooldownKey, "1", "EX", COOLDOWN_SECONDS);

    // 5. Send verification email to tenant owner/admin email
    const { subject, html } = tenantMobileVerificationTemplate({
      otp,
      phone: normalizedPhone,
      tenantName: tenant.name,
      ttlMinutes: OTP_TTL_MINUTES,
    });

    await this.emailService.send({
      to: tenant.email,
      subject,
      html,
    });

    this.logger.info("Tenant mobile verification OTP sent via email", {
      action: "tenant_verification.otp_sent",
      tenantId,
      phone: normalizedPhone,
      email: tenant.email,
    });

    return {
      message: `Verification code sent to ${tenant.email}`,
      cooldownSeconds: COOLDOWN_SECONDS,
    };
  }
}
