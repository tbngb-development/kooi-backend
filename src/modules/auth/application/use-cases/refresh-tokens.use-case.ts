import { NotFoundError } from "../../../../shared/errors";
import type {
  RefreshTokensInput,
  RefreshTokensOutput,
} from "../dto/refresh.dto";
import { type AuthRepository } from "../interfaces/auth-repository.interface";
import { type TokenService } from "../interfaces/token-service.interface";
import {
  RefreshTokenExpiredError,
  RefreshTokenInvalidError,
} from "../../domain/errors/auth.errors";

export class RefreshTokensUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly tokenService: TokenService,
  ) {}

  async execute(input: RefreshTokensInput): Promise<RefreshTokensOutput> {
    // 1. Verify JWT signature
    const payload = this.tokenService.verifyRefreshToken(input.refreshToken);

    // 2. Look up token in DB
    const storedToken = await this.authRepository.findRefreshToken(
      payload.tokenId,
    );

    if (!storedToken) {
      throw new RefreshTokenInvalidError();
    }

    // 3. REUSE DETECTION: If this token was already revoked,
    //    someone is replaying a stolen token. Kill the entire family.
    if (storedToken.revokedAt !== null) {
      await this.authRepository.revokeRefreshTokenFamily(storedToken.familyId);
      throw new RefreshTokenInvalidError();
    }

    // 4. Check expiry
    if (storedToken.expiresAt < new Date()) {
      throw new RefreshTokenExpiredError();
    }

    // 5. Revoke old token (rotation)
    await this.authRepository.revokeRefreshToken(storedToken.id);

    // 6. Fetch user for context
    const user = await this.authRepository.findUserById(storedToken.userId);
    if (!user) {
      throw new NotFoundError("User");
    }

    // 7. Determine token type based on user's memberships
    const activeMemberships = user.memberships.filter((m) => m.tenantActive);

    let accessToken: string;

    if (activeMemberships.length === 1) {
      accessToken = this.tokenService.generateAccessToken({
        userId: user.id,
        membershipId: activeMemberships[0].id,
        tenantId: activeMemberships[0].tenantId,
        tenantRole: activeMemberships[0].role,
        isPlatformAdmin: user.isPlatformAdmin,
      });
    } else if (user.isPlatformAdmin && activeMemberships.length === 0) {
      accessToken = this.tokenService.generateAdminAccessToken(user.id);
    } else {
      accessToken = this.tokenService.generateBaseAccessToken(
        user.id,
        user.isPlatformAdmin,
      );
    }

    // 8. Generate new refresh token INHERITING the same family
    const refreshTokenData = this.tokenService.generateRefreshTokenForFamily(
      user.id,
      storedToken.familyId, // ← Same family chain
    );

    await this.authRepository.saveRefreshToken({
      tokenHash: refreshTokenData.tokenHash,
      userId: user.id,
      familyId: refreshTokenData.familyId,
      expiresAt: new Date(Date.now() + refreshTokenData.expiresIn * 1000),
    });

    return {
      accessToken,
      refreshToken: refreshTokenData.rawToken,
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: refreshTokenData.expiresIn,
    };
  }
}
