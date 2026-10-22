import type { AuthRepository } from "../interfaces/auth-repository.interface";
import type { OtpService } from "../interfaces/otp-service.interface";
import type { EmailVerificationTokenService } from "../interfaces/email-verification-token.service.interface";
import type {
  VerifyRegisterOtpInput,
  VerifyRegisterOtpOutput,
} from "../dto/verify-register-otp.dto";
import {
  EmailAlreadyExistsError,
  InvalidOtpError,
  OtpMaxAttemptsError,
} from "../../domain/errors/auth.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

const OTP_PURPOSE = "register";
const TOKEN_EXPIRY_SECONDS = 900; // 15 mins

export class VerifyRegisterOtpUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly otpService: OtpService,
    private readonly emailVerificationTokenService: EmailVerificationTokenService,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: VerifyRegisterOtpInput,
  ): Promise<VerifyRegisterOtpOutput> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // 1. Prevent verifying for already registered emails
    const existingUser =
      await this.authRepository.findUserByEmail(normalizedEmail);
    if (existingUser) {
      this.logger.warn(
        "Register OTP verification failed — email already exists",
        {
          action: "register.verify_otp",
          email: normalizedEmail,
        },
      );
      throw new EmailAlreadyExistsError();
    }

    // 2. Verify OTP
    const verification = await this.otpService.verify(
      OTP_PURPOSE,
      normalizedEmail,
      input.otp,
    );

    if (verification.maxAttemptsExceeded) {
      this.logger.warn("Registration OTP max attempts exceeded", {
        action: "register.verify_otp",
        email: normalizedEmail,
      });
      throw new OtpMaxAttemptsError();
    }

    if (!verification.valid) {
      this.logger.warn("Registration OTP invalid", {
        action: "register.verify_otp",
        email: normalizedEmail,
      });
      throw new InvalidOtpError();
    }

    // 3. Generate single-use verification token
    const verificationToken =
      await this.emailVerificationTokenService.generate(normalizedEmail);

    this.logger.info("Registration OTP verified successfully", {
      action: "register.verify_otp",
      email: normalizedEmail,
    });

    return {
      verificationToken,
      email: normalizedEmail,
      expiresIn: TOKEN_EXPIRY_SECONDS,
    };
  }
}
