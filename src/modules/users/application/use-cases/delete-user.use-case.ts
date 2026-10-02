import { type UserRepository } from "../interfaces/user-repository.interface";
import {
  UserNotFoundError,
  SelfDeletionError,
} from "../../domain/errors/user.errors";

export class DeleteUserUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(
    tenantId: string,
    activeUserId: string,
    targetUserId: string,
  ): Promise<void> {
    if (activeUserId === targetUserId) {
      throw new SelfDeletionError();
    }

    const member = await this.userRepo.findById(tenantId, targetUserId);
    if (!member) {
      throw new UserNotFoundError();
    }

    await this.userRepo.delete(tenantId, targetUserId);
  }
}
