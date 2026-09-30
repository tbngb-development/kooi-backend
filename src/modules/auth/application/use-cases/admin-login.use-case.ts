import type { LoginInput, LoginOutput } from "../dto/login.dto";
import { type AuthRepository } from "../interfaces/auth-repository.interface";
import { type PasswordService } from "../interfaces/password-service.interface";
import { type TokenService } from "../interfaces/token-service.interface";
import { InvalidCredentialsError } from "../../domain/errors/auth.errors";
import { ForbiddenError, UnauthorizedError } from "../../../../shared/errors";
import { AuthMessages } from "../../../../shared/constants/messages";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class AdminLoginUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly logger: Logger,
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const user = await this.authRepository.findUserByEmail(input.email);
    if (!user) {
      this.logger.warn("Admin login failed — user not found", {
        action: "admin.login",
        email: input.email,
      });
      throw new InvalidCredentialsError();
    }

    if (!user.isActive) {
      this.logger.warn("Admin login failed — account deactivated", {
        action: "admin.login",
        userId: user.id,
      });
      throw new ForbiddenError(
        "Your account has been deactivated by the platform administrator.",
      );
    }

    // 1. Enforce Admin Privilege BEFORE hashing or token generation
    if (!user.isPlatformAdmin) {
      this.logger.warn("Admin login failed — not a platform admin", {
        action: "admin.login",
        userId: user.id,
      });
      throw new UnauthorizedError(AuthMessages.NOT_PLATFORM_ADMIN);
    }

    // 2. Verify password
    const isValidPassword = await this.passwordService.compare(
      input.password,
      user.passwordHash,
    );
    if (!isValidPassword) {
      this.logger.warn("Admin login failed — invalid password", {
        action: "admin.login",
        userId: user.id,
      });
      throw new InvalidCredentialsError();
    }

    // 3. Issue Admin Tokens
    const accessToken = this.tokenService.generateAdminAccessToken(user.id);
    const refreshTokenData = this.tokenService.generateRefreshToken(user.id);

    await this.authRepository.saveRefreshToken({
      tokenHash: refreshTokenData.tokenHash,
      userId: user.id,
      familyId: refreshTokenData.familyId,
      expiresAt: new Date(Date.now() + refreshTokenData.expiresIn * 1000),
    });

    this.logger.info("Admin login successful", {
      action: "admin.login",
      userId: user.id,
    });

    return {
      accessToken,
      refreshToken: refreshTokenData.rawToken,
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: refreshTokenData.expiresIn,
      requiresTenantSelection: false,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isPlatformAdmin: true,
      },
      memberships: [],
    };
  }
}
