import { ValidationError } from "../../../../shared/errors";
import type {
  RegisterTenantOwnerInput,
  RegisterTenantOwnerOutput,
} from "../dto/register.dto";
import { type AuthRepository } from "../interfaces/auth-repository.interface";
import { type PasswordService } from "../interfaces/password-service.interface";
import { type TokenService } from "../interfaces/token-service.interface";
import { EmailAlreadyExistsError } from "../../domain/errors/auth.errors";
import { validatePasswordStrength } from "../../domain/rules/password.rules";

export class RegisterTenantOwnerUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(
    input: RegisterTenantOwnerInput,
  ): Promise<RegisterTenantOwnerOutput> {
    // 1. Validate password strength
    const passwordValidation = validatePasswordStrength(input.password);
    if (!passwordValidation.isValid) {
      throw new ValidationError(
        passwordValidation.errors.map((msg) => ({
          field: "password",
          message: msg,
        })),
      );
    }

    // 2. Check existing user
    const existingUser = await this.authRepository.findUserByEmail(input.email);
    if (existingUser) {
      throw new EmailAlreadyExistsError();
    }

    // 3. Hash password
    const passwordHash = await this.passwordService.hash(input.password);

    // 4. Create tenant + user + membership in transaction
    const result = await this.authRepository.registerTenantOwner({
      tenantName: input.tenantName,
      tenantEmail: input.email,
      userEmail: input.email,
      userName: input.name,
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      termsVersion: input.termsVersion,
      passwordHash,
    });

    // 5. Generate tokens
    const accessToken = this.tokenService.generateAccessToken({
      userId: result.user.id,
      membershipId: result.membershipId,
      tenantId: result.tenantId,
      tenantRole: "OWNER",
      isPlatformAdmin: result.user.isPlatformAdmin,
    });

    const refreshTokenData = this.tokenService.generateRefreshToken(
      result.user.id,
    );

    await this.authRepository.saveRefreshToken({
      tokenHash: refreshTokenData.tokenHash,
      userId: result.user.id,
      expiresAt: new Date(Date.now() + refreshTokenData.expiresIn * 1000),
    });

    return {
      accessToken,
      refreshToken: refreshTokenData.rawToken,
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: refreshTokenData.expiresIn,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      tenant: {
        id: result.tenantId,
        name: input.tenantName,
      },
      membership: {
        id: result.membershipId,
        role: "OWNER",
      },
    };
  }
}
