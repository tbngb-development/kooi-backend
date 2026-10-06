import type { AuthRepository } from "../interfaces/auth-repository.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface RevokeAllSessionsInput {
  userId: string;
}

export interface RevokeAllSessionsResult {
  revokedCount: number;
  message: string;
}

export class RevokeAllSessionsUseCase {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: RevokeAllSessionsInput,
  ): Promise<RevokeAllSessionsResult> {
    const revokedCount = await this.authRepo.revokeAllUserRefreshTokens(
      input.userId,
    );

    this.logger.info("User revoked all active sessions globally", {
      action: "auth.revoke_all_sessions",
      userId: input.userId,
      revokedTokensCount: revokedCount,
    });

    return {
      revokedCount,
      message: "All sessions have been successfully revoked.",
    };
  }
}
