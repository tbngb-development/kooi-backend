import type { AuthRepository } from "../interfaces/auth-repository.interface";
import type { PasswordService } from "../interfaces/password-service.interface";
import type {
  ChangePasswordInput,
  ChangePasswordOutput,
} from "../dto/change-password.dto";
import {
  InvalidOldPasswordError,
  SamePasswordError,
} from "../../domain/errors/auth.errors";
import { UnauthorizedError } from "../../../../shared/errors/unauthorized.error";
import { AuthMessages } from "../../../../shared/constants/messages";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class ChangePasswordUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly logger: Logger,
  ) {}

  async execute(input: ChangePasswordInput): Promise<ChangePasswordOutput> {
    const user = await this.authRepository.findUserById(input.userId);
    if (!user) {
      this.logger.warn("Change password failed — user not found", {
        action: "password.change",
        userId: input.userId,
      });
      throw new UnauthorizedError(AuthMessages.USER_NOT_FOUND);
    }

    const isOldValid = await this.passwordService.compare(
      input.oldPassword,
      user.passwordHash,
    );
    if (!isOldValid) {
      this.logger.warn("Change password failed — invalid old password", {
        action: "password.change",
        userId: user.id,
      });
      throw new InvalidOldPasswordError();
    }

    const isSame = await this.passwordService.compare(
      input.newPassword,
      user.passwordHash,
    );
    if (isSame) {
      this.logger.warn("Change password failed — same as current password", {
        action: "password.change",
        userId: user.id,
      });
      throw new SamePasswordError();
    }

    const newHash = await this.passwordService.hash(input.newPassword);
    await this.authRepository.updateUserPassword(user.id, newHash);

    // Invalidate all refresh tokens across sessions for security
    await this.authRepository.revokeAllUserRefreshTokens(user.id);

    this.logger.info("Password changed successfully", {
      action: "password.change",
      userId: user.id,
    });

    return { message: AuthMessages.PASSWORD_CHANGED_SUCCESS };
  }
}
