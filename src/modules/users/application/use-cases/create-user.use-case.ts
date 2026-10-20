import { type PasswordService } from "../../../auth/application/interfaces/password-service.interface";
import { type CreateUserInput } from "../dto/user.dto";
import { validatePasswordStrength } from "../../../auth/domain/rules/password.rules";
import { ValidationError } from "../../../../shared/errors/validation.error";
import crypto from "crypto";
import { type UserRepository } from "../interfaces/user-repository.interface";
import { type TenantMemberData } from "../../domain/entities/tenant-member.entity";
import {
  EmailAlreadyRegisteredError,
  CannotGrantOwnerRoleError,
} from "../../domain/errors/user.errors";
import { type TenantRole } from "@prisma/client";

export class CreateUserUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(
    tenantId: string,
    input: CreateUserInput,
    actorRole?: TenantRole,
  ): Promise<TenantMemberData> {
    // Role Hierarchy Guard: An ADMIN cannot create a user with OWNER role
    if (actorRole && actorRole !== "OWNER" && input.role === "OWNER") {
      throw new CannotGrantOwnerRoleError();
    }

    const existing = await this.userRepo.findByEmail(input.email);
    if (existing) {
      throw new EmailAlreadyRegisteredError();
    }

    // Default password generation if not explicitly provided
    const plainPassword =
      input.password ?? crypto.randomBytes(12).toString("hex") + "A1!";

    // Explicit password strength check
    const validation = validatePasswordStrength(plainPassword);
    if (!validation.isValid) {
      throw new ValidationError(
        validation.errors.map((msg) => ({
          field: "password",
          message: msg,
        })),
      );
    }

    const passwordHash = await this.passwordService.hash(plainPassword);

    return this.userRepo.create(tenantId, {
      email: input.email,
      name: input.name,
      passwordHash,
      role: input.role ?? "USER",
    });
  }
}
