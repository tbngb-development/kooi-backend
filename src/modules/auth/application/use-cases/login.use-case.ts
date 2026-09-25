import { type MembershipInfo } from "../../../../shared/types";
import type { LoginInput, LoginOutput } from "../dto/login.dto";
import { type AuthRepository } from "../interfaces/auth-repository.interface";
import { type PasswordService } from "../interfaces/password-service.interface";
import { type TokenService } from "../interfaces/token-service.interface";
import { InvalidCredentialsError } from "../../domain/errors/auth.errors";
import { ForbiddenError } from "../../../../shared/errors";

export class LoginUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    // 1. Find user
    const user = await this.authRepository.findUserByEmail(input.email);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    if (!user.isActive) {
      throw new ForbiddenError(
        `Your account has been deactivated by the platform administrator. Please contact the support team for assistance.`,
      );
    }

    // 2. Verify password
    const isValidPassword = await this.passwordService.compare(
      input.password,
      user.passwordHash,
    );
    if (!isValidPassword) {
      throw new InvalidCredentialsError();
    }

    // 3. Build memberships list
    const memberships: MembershipInfo[] = user.memberships
      .filter((m) => m.tenantActive)
      .map((m) => ({
        membershipId: m.id,
        tenantId: m.tenantId,
        tenantName: m.tenantName,
        role: m.role,
      }));

    const userResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      isPlatformAdmin: user.isPlatformAdmin,
    };

    // 4. Determine token strategy
    const activeMemberships = memberships;

    // Case A: tenantId explicitly provided
    if (input.tenantId) {
      const membership = activeMemberships.find(
        (m) => m.tenantId === input.tenantId,
      );
      if (!membership) {
        throw new InvalidCredentialsError();
      }
      return this.buildTokenResponse(
        user.id,
        user.isPlatformAdmin,
        membership,
        memberships,
        userResponse,
      );
    }

    // Case B: Single membership — auto-select
    if (activeMemberships.length === 1) {
      return this.buildTokenResponse(
        user.id,
        user.isPlatformAdmin,
        activeMemberships[0],
        memberships,
        userResponse,
      );
    }

    // Case C: Zero memberships but platform admin
    if (activeMemberships.length === 0 && user.isPlatformAdmin) {
      const accessToken = this.tokenService.generateAdminAccessToken(user.id);
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
        requiresTenantSelection: false,
        user: userResponse,
        memberships,
      };
    }

    // Case D: Multiple memberships — require selection
    const baseAccessToken = this.tokenService.generateBaseAccessToken(
      user.id,
      user.isPlatformAdmin,
    );
    const refreshTokenData = this.tokenService.generateRefreshToken(user.id);
    await this.authRepository.saveRefreshToken({
      tokenHash: refreshTokenData.tokenHash,
      userId: user.id,
      familyId: refreshTokenData.familyId,
      expiresAt: new Date(Date.now() + refreshTokenData.expiresIn * 1000),
    });

    return {
      accessToken: baseAccessToken,
      refreshToken: refreshTokenData.rawToken,
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: refreshTokenData.expiresIn,
      requiresTenantSelection: true,
      user: userResponse,
      memberships,
    };
  }

  private async buildTokenResponse(
    userId: string,
    isPlatformAdmin: boolean,
    membership: MembershipInfo,
    memberships: MembershipInfo[],
    userResponse: LoginOutput["user"],
  ): Promise<LoginOutput> {
    const accessToken = this.tokenService.generateAccessToken({
      userId,
      membershipId: membership.membershipId,
      tenantId: membership.tenantId,
      tenantRole: membership.role,
      isPlatformAdmin,
    });

    const refreshTokenData = this.tokenService.generateRefreshToken(userId);

    await this.authRepository.saveRefreshToken({
      tokenHash: refreshTokenData.tokenHash,
      userId,
      familyId: refreshTokenData.familyId,
      expiresAt: new Date(Date.now() + refreshTokenData.expiresIn * 1000),
    });

    return {
      accessToken,
      refreshToken: refreshTokenData.rawToken,
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: refreshTokenData.expiresIn,
      requiresTenantSelection: false,
      user: userResponse,
      memberships,
    };
  }
}
