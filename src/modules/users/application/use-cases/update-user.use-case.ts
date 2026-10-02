import { type UserRepository } from "../interfaces/user-repository.interface";
import { type UpdateUserInput } from "../dto/user.dto";
import { type TenantMemberData } from "../../domain/entities/tenant-member.entity";
import { UserNotFoundError } from "../../domain/errors/user.errors";

export class UpdateUserUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(
    tenantId: string,
    userId: string,
    input: UpdateUserInput,
  ): Promise<TenantMemberData> {
    const member = await this.userRepo.findById(tenantId, userId);
    if (!member) {
      throw new UserNotFoundError();
    }

    return this.userRepo.update(tenantId, userId, input);
  }
}
