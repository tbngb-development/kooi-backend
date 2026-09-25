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
    // 1. Find and validate user status
    const user = await this.authRepository.findUserByEmail(input.email);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    if (!user.isActive) {
      throw new ForbiddenError(
        "Your account has been deactivated. Please contact support.",
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

    // 3. Collect active memberships
    const activeMemberships: MembershipInfo[] = user.memberships
      .filter((m) => m.tenantActive)
      .map((m) => ({
        membershipId: m.id,
        tenantId: m.tenantId,
        tenantName: m.tenantName,
        role: m.role,
      }));

    // 4. Resolve Target Membership
    let selectedMembership: MembershipInfo | null = null;
    let requiresTenantSelection = false;

    if (input.tenantId) {
      // Explicit tenant requested
      selectedMembership =
        activeMemberships.find((m) => m.tenantId === input.tenantId) ?? null;
      if (!selectedMembership) {
        throw new InvalidCredentialsError();
      }
    } else if (activeMemberships.length === 1) {
      // Auto-select single membership (UX optimization)
      selectedMembership = activeMemberships[0];
    } else {
      // 0 or >1 memberships (user must select tenant next)
      requiresTenantSelection = true;
    }

    // 5. Generate appropriate Access Token
    let accessToken: string;
    if (selectedMembership) {
      accessToken = this.tokenService.generateAccessToken({
        userId: user.id,
        membershipId: selectedMembership.membershipId,
        tenantId: selectedMembership.tenantId,
        tenantRole: selectedMembership.role,
        isPlatformAdmin: user.isPlatformAdmin,
      });
    } else {
      accessToken = this.tokenService.generateBaseAccessToken(
        user.id,
        user.isPlatformAdmin,
      );
    }

    // 6. Generate and save Refresh Token (Single place!)
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
      requiresTenantSelection,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isPlatformAdmin: user.isPlatformAdmin,
      },
      memberships: activeMemberships,
    };
  }
}
