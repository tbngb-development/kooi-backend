import type { AuthRepository } from "../interfaces/auth-repository.interface";
import type { OtpService } from "../interfaces/otp-service.interface";
import type { IEmailService } from "../../../../shared/config/external/email/email.interface";
import { EmailAlreadyExistsError } from "../../domain/errors/auth.errors";

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
  ) {}

  async execute(input: SendRegisterOtpInput): Promise<SendRegisterOtpOutput> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // 1. Prevent generating codes for registered email addresses
    const existingUser =
      await this.authRepository.findUserByEmail(normalizedEmail);
    if (existingUser) {
      throw new EmailAlreadyExistsError();
    }

    // 2. Generate and store OTP in Redis (auto-rate-limits using RedisOtpService attempts tracker)
    const otp = await this.otpService.generateAndStore(
      OTP_PURPOSE,
      normalizedEmail,
    );

    // 3. Send email layout inline
    const subject = "Verify your email - KOOI Registration";
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #111827; font-size: 24px; font-weight: 600; margin-bottom: 16px;">Welcome to KOOI</h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin-bottom: 24px;">
          Thank you for signing up. Please use the verification code below to verify your email address and complete your workspace registration:
        </p>
        <div style="background-color: #f3f4f6; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 4px; color: #111827;">${otp}</span>
        </div>
        <p style="color: #6b7280; font-size: 14px; line-height: 20px;">
          This verification code is valid for ${OTP_TTL_MINUTES} minutes. If you did not request this verification, you can safely ignore this email.
        </p>
      </div>
    `;

    await this.emailService.send({
      to: normalizedEmail,
      subject,
      html,
    });

    return {
      message: "Verification code sent to your email address.",
    };
  }
}
