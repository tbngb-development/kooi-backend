import type { AuthRepository } from "../interfaces/auth-repository.interface";
import type { OtpService } from "../interfaces/otp-service.interface";
import type { IEmailService } from "../../../../shared/config/external/email/email.interface";
import { EmailAlreadyExistsError } from "../../domain/errors/auth.errors";
import { registerOtpTemplate } from "../../../../shared/config/external/email/templates/register-otp.template";
import type { Logger } from "../../../../shared/logging/logger.interface";

const OTP_PURPOSE = "register";
const OTP_TTL_MINUTES = 5;

export interface SendRegisterOtpInput {
  email: string;
}

export interface SendRegisterOtpOutput {
  message: string;
}

export class SendRegisterOtpUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly otpService: OtpService,
    private readonly emailService: IEmailService,
    private readonly logger: Logger,
  ) {}

  async execute(input: SendRegisterOtpInput): Promise<SendRegisterOtpOutput> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // 1. Prevent generating codes for already registered email addresses
    const existingUser =
      await this.authRepository.findUserByEmail(normalizedEmail);
    if (existingUser) {
      this.logger.warn("Register OTP requested for existing email", {
        action: "register.send_otp",
        email: normalizedEmail,
      });
      throw new EmailAlreadyExistsError();
    }

    // 2. Generate and store OTP in Redis
    const otp = await this.otpService.generateAndStore(
      OTP_PURPOSE,
      normalizedEmail,
    );

    // 3. Build email layout via shared template
    const { subject, html } = registerOtpTemplate({
      otp,
      ttlMinutes: OTP_TTL_MINUTES,
    });

    // 4. Send email
    await this.emailService.send({
      to: normalizedEmail,
      subject,
      html,
    });

    this.logger.info("Registration OTP sent", {
      action: "register.send_otp",
      email: normalizedEmail,
    });

    return {
      message: "Verification code sent to your email address.",
    };
  }
}
