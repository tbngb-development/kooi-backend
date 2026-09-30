import type { AuthRepository } from "../interfaces/auth-repository.interface";
import type { OtpService } from "../interfaces/otp-service.interface";
import type { PasswordResetTokenService } from "../interfaces/password-reset-token.service.interface";
import type { VerifyOtpInput, VerifyOtpOutput } from "../dto/verify-otp.dto";
import {
  InvalidOtpError,
  OtpMaxAttemptsError,
} from "../../domain/errors/auth.errors";
import { env } from "../../../../shared/config/env";
import type { Logger } from "../../../../shared/logging/logger.interface";

const OTP_PURPOSE = "password-reset";

export class VerifyForgotPasswordOtpUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly otpService: OtpService,
    private readonly resetTokenService: PasswordResetTokenService,
    private readonly logger: Logger,
  ) {}

  async execute(input: VerifyOtpInput): Promise<VerifyOtpOutput> {
    const normalizedEmail = input.email.trim().toLowerCase();

    const result = await this.otpService.verify(
      OTP_PURPOSE,
      normalizedEmail,
      input.otp,
    );

    if (result.maxAttemptsExceeded) {
      this.logger.warn("Password reset OTP max attempts exceeded", {
        action: "password.verify_otp",
        email: normalizedEmail,
      });
      throw new OtpMaxAttemptsError();
    }

    if (!result.valid) {
      this.logger.warn("Password reset OTP invalid", {
        action: "password.verify_otp",
        email: normalizedEmail,
      });
      throw new InvalidOtpError();
    }

    // At this point OTP is valid; fetch user to bind the reset token
    const user = await this.authRepository.findUserByEmail(normalizedEmail);
    if (!user || !user.isActive) {
      // Should not happen — OTP would not have been issued. Fail closed.
      this.logger.warn(
        "Password reset OTP verified but user missing/inactive",
        {
          action: "password.verify_otp",
          email: normalizedEmail,
        },
      );
      throw new InvalidOtpError();
    }

    const resetToken = await this.resetTokenService.generate(
      user.id,
      user.email,
    );

    const expiresIn = this.parseExpiryToSeconds(env.jwt.passwordResetExpiry);

    this.logger.info("Password reset OTP verified", {
      action: "password.verify_otp",
      userId: user.id,
    });

    return {
      resetToken,
      expiresIn,
    };
  }

  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 600;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case "s":
        return value;
      case "m":
        return value * 60;
      case "h":
        return value * 3600;
      case "d":
        return value * 86400;
      default:
        return 600;
    }
  }
}
