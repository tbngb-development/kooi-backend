import type { AuthRepository } from "../interfaces/auth-repository.interface";
import type { PasswordService } from "../interfaces/password-service.interface";
import type { PasswordResetTokenService } from "../interfaces/password-reset-token.service.interface";
import type {
  ResetPasswordInput,
  ResetPasswordOutput,
} from "../dto/reset-password.dto";
import {
  InvalidResetTokenError,
  SamePasswordError,
} from "../../domain/errors/auth.errors";
import { AuthMessages } from "../../../../shared/constants/messages";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class ResetPasswordUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly resetTokenService: PasswordResetTokenService,
    private readonly logger: Logger,
  ) {}

  async execute(input: ResetPasswordInput): Promise<ResetPasswordOutput> {
    const payload = await this.resetTokenService.verify(input.resetToken);

    const user = await this.authRepository.findUserById(payload.userId);
    if (!user || !user.isActive) {
      this.logger.warn("Password reset failed — user missing/inactive", {
        action: "password.reset",
        userId: payload.userId,
      });
      throw new InvalidResetTokenError();
    }

    const isSame = await this.passwordService.compare(
      input.newPassword,
      user.passwordHash,
    );
    if (isSame) {
      this.logger.warn("Password reset failed — same as current password", {
        action: "password.reset",
        userId: user.id,
      });
      throw new SamePasswordError();
    }

    const newHash = await this.passwordService.hash(input.newPassword);
    await this.authRepository.updateUserPassword(user.id, newHash);

    // Single-use token: invalidate
    await this.resetTokenService.invalidate(input.resetToken);

    // Invalidate all refresh tokens across sessions
    await this.authRepository.revokeAllUserRefreshTokens(user.id);

    this.logger.info("Password reset successful", {
      action: "password.reset",
      userId: user.id,
    });

    return { message: AuthMessages.PASSWORD_RESET_SUCCESS };
  }
}
