import { type UserRepository } from "../interfaces/user-repository.interface";
import { type UpdateUserInput } from "../dto/user.dto";
import { type TenantMemberData } from "../../domain/entities/tenant-member.entity";
import {
  UserNotFoundError,
  InsufficientRoleHierarchyError,
  CannotGrantOwnerRoleError,
  LastOwnerCannotBeRemovedError,
} from "../../domain/errors/user.errors";
import { type TenantRole } from "@prisma/client";

export class UpdateUserUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(
    tenantId: string,
    userId: string,
    input: UpdateUserInput,
    actorRole?: TenantRole,
  ): Promise<TenantMemberData> {
    const member = await this.userRepo.findById(tenantId, userId);
    if (!member) {
      throw new UserNotFoundError();
    }

    // 1. Role Hierarchy Guard: An ADMIN cannot grant OWNER privileges to anyone (including themselves)
    if (actorRole && actorRole !== "OWNER" && input.role === "OWNER") {
      throw new CannotGrantOwnerRoleError();
    }

    // 2. Role Hierarchy Guard: An ADMIN cannot modify an OWNER's details or role
    if (actorRole && actorRole !== "OWNER" && member.role === "OWNER") {
      throw new InsufficientRoleHierarchyError();
    }

    // 3. Organization Invariant Guard: Cannot demote the last remaining OWNER
    if (member.role === "OWNER" && input.role && input.role !== "OWNER") {
      const ownerCount = await this.userRepo.countOwners(tenantId);
      if (ownerCount <= 1) {
        throw new LastOwnerCannotBeRemovedError();
      }
    }

    return this.userRepo.update(tenantId, userId, input);
  }
}
