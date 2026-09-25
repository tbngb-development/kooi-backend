import type { AuthRepository } from "../../application/interfaces/auth-repository.interface";

export class RefreshTokenCleanupService {
  constructor(private readonly authRepository: AuthRepository) {}

  async cleanup(olderThanDays = 30): Promise<number> {
    const deleted =
      await this.authRepository.cleanupExpiredRefreshTokens(olderThanDays);
    console.log(
      `[RefreshTokenCleanup] Removed ${deleted} expired/revoked tokens older than ${olderThanDays} days`,
    );
    return deleted;
  }
}
