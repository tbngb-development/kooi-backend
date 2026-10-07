import type { AuthRepository } from "../../application/interfaces/auth-repository.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class RefreshTokenCleanupService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly logger: Logger,
  ) {}

  async cleanup(olderThanDays = 30): Promise<number> {
    const deleted = await this.authRepository.cleanupOrphanedAndExpiredTokenFamilies(olderThanDays);
    this.logger.info("Executed family-aware refresh token cleanup", {
      action: "auth.refresh_token_cleanup",
      deletedTokensCount: deleted,
      retentionDays: olderThanDays,
    });
    return deleted;
  }
}