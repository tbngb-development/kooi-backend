import { NotFoundError } from "../../../../shared/errors";
import type {
  SelectTenantInput,
  SelectTenantOutput,
} from "../dto/select-tenant.dto";
import { type AuthRepository } from "../interfaces/auth-repository.interface";
import { type TokenService } from "../interfaces/token-service.interface";
import {
  MembershipNotFoundError,
  TenantInactiveError,
} from "../../domain/errors/auth.errors";

export class SelectTenantUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly tokenService: TokenService,
  ) {}

  async execute(input: SelectTenantInput): Promise<SelectTenantOutput> {
    // 1. Verify user exists
    const user = await this.authRepository.findUserById(input.userId);
    if (!user) {
      throw new NotFoundError("User");
    }

    // 2. Verify membership
    const membership = await this.authRepository.findMembership(
      input.userId,
      input.tenantId,
    );
    if (!membership) {
      throw new MembershipNotFoundError();
    }

    // 3. Verify tenant is active
    if (!membership.tenantActive) {
      throw new TenantInactiveError();
    }

    // 4. Generate tenant-scoped tokens
    const accessToken = this.tokenService.generateAccessToken({
      userId: user.id,
      membershipId: membership.id,
      tenantId: membership.tenantId,
      tenantRole: membership.role,
      isPlatformAdmin: user.isPlatformAdmin,
    });

    const refreshTokenData = this.tokenService.generateRefreshToken(user.id);

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
      membership: {
        id: membership.id,
        tenantId: membership.tenantId,
        tenantName: membership.tenantName,
        role: membership.role,
      },
    };
  }
}
