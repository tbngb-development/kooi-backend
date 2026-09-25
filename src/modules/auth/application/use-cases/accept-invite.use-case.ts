import { AuthMessages } from "../../../../shared/constants";
import { ForbiddenError, ValidationError } from "../../../../shared/errors";
import type { AcceptInviteInput, AcceptInviteOutput } from "../dto/invite.dto";
import { type AuthRepository } from "../interfaces/auth-repository.interface";
import { type PasswordService } from "../interfaces/password-service.interface";
import { type TokenService } from "../interfaces/token-service.interface";
import {
  AlreadyMemberError,
  InvalidInviteError,
} from "../../domain/errors/auth.errors";
import { validatePasswordStrength } from "../../domain/rules/password.rules";

export class AcceptInviteUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(input: AcceptInviteInput): Promise<AcceptInviteOutput> {
    // 1. Verify invite token
    const invitePayload = this.tokenService.verifyInviteToken(
      input.inviteToken,
    );

    // 2. Email must match invite
    if (invitePayload.email.toLowerCase() !== input.email.toLowerCase()) {
      throw new ForbiddenError(AuthMessages.INVITE_EMAIL_MISMATCH);
    }

    // 3. Verify tenant is still active
    const tenantActive = await this.authRepository.checkTenantActive(
      invitePayload.tenantId,
    );
    if (!tenantActive) {
      throw new InvalidInviteError();
    }

    // 4. Check existing user
    const existingUser = await this.authRepository.findUserByEmail(input.email);

    let userId: string;
    let userName: string;
    let userEmail: string;
    let isPlatformAdmin: boolean;
    let membershipId: string;
    let membershipTenantName: string;

    if (existingUser) {
      // Existing user — just add membership
      const alreadyMember = await this.authRepository.checkMembershipExists(
        existingUser.id,
        invitePayload.tenantId,
      );
      if (alreadyMember) {
        throw new AlreadyMemberError();
      }

      const membership = await this.authRepository.createMembership({
        userId: existingUser.id,
        tenantId: invitePayload.tenantId,
        role: invitePayload.role,
      });

      userId = existingUser.id;
      userName = existingUser.name;
      userEmail = existingUser.email;
      isPlatformAdmin = existingUser.isPlatformAdmin;
      membershipId = membership.id;
      membershipTenantName = membership.tenantName;
    } else {
      // New user — validate password + create user + membership
      const passwordValidation = validatePasswordStrength(input.password);
      if (!passwordValidation.isValid) {
        throw new ValidationError(
          passwordValidation.errors.map((msg) => ({
            field: "password",
            message: msg,
          })),
        );
      }

      const passwordHash = await this.passwordService.hash(input.password);

      const result = await this.authRepository.registerMember({
        userEmail: input.email,
        userName: input.name,
        passwordHash,
        tenantId: invitePayload.tenantId,
        role: invitePayload.role,
      });

      const membership = await this.authRepository.findMembership(
        result.user.id,
        invitePayload.tenantId,
      );

      if (!membership) {
        throw new Error("Failed to retrieve membership after creation");
      }

      userId = result.user.id;
      userName = result.user.name;
      userEmail = result.user.email;
      isPlatformAdmin = result.user.isPlatformAdmin;
      membershipId = result.membershipId;
      membershipTenantName = membership.tenantName;
    }

    // 5. Generate tokens for the new tenant context
    const accessToken = this.tokenService.generateAccessToken({
      userId,
      membershipId,
      tenantId: invitePayload.tenantId,
      tenantRole: invitePayload.role,
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
      user: {
        id: userId,
        email: userEmail,
        name: userName,
      },
      membership: {
        id: membershipId,
        tenantId: invitePayload.tenantId,
        tenantName: membershipTenantName,
        role: invitePayload.role,
      },
    };
  }
}
