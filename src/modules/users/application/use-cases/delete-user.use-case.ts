import { type UserRepository } from "../interfaces/user-repository.interface";
import {
  UserNotFoundError,
  SelfDeletionError,
  InsufficientRoleHierarchyError,
  LastOwnerCannotBeRemovedError,
} from "../../domain/errors/user.errors";
import { type TenantRole } from "@prisma/client";

export class DeleteUserUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(
    tenantId: string,
    activeUserId: string,
    targetUserId: string,
    actorRole?: TenantRole,
  ): Promise<void> {
    if (activeUserId === targetUserId) {
      throw new SelfDeletionError();
    }

    const member = await this.userRepo.findById(tenantId, targetUserId);
    if (!member) {
      throw new UserNotFoundError();
    }

    // 1. Role Hierarchy Guard: An ADMIN cannot delete an OWNER
    if (actorRole && actorRole !== "OWNER" && member.role === "OWNER") {
      throw new InsufficientRoleHierarchyError();
    }

    // 2. Organization Invariant Guard: Cannot delete the final remaining OWNER
    if (member.role === "OWNER") {
      const ownerCount = await this.userRepo.countOwners(tenantId);
      if (ownerCount <= 1) {
        throw new LastOwnerCannotBeRemovedError();
      }
    }

    await this.userRepo.delete(tenantId, targetUserId);
  }
}
