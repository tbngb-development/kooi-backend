import { type AuthRepository } from "../interfaces/auth-repository.interface";
import { type TokenService } from "../interfaces/token-service.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface LogoutInput {
  refreshToken: string;
}

export class LogoutUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly tokenService: TokenService,
    private readonly logger: Logger,
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    try {
      const payload = this.tokenService.verifyRefreshToken(input.refreshToken);
      const storedToken = await this.authRepository.findRefreshToken(
        payload.tokenId,
      );

      if (storedToken && storedToken.revokedAt === null) {
        await this.authRepository.revokeRefreshToken(storedToken.id);
        this.logger.info("User logged out", {
          action: "auth.logout",
          userId: storedToken.userId,
        });
      }
    } catch {
      // Logout should be idempotent — swallow token errors
    }
  }
}
