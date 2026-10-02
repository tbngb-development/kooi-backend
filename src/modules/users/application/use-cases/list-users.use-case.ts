import { type TenantMemberData } from "../../domain/entities/tenant-member.entity";
import { type UserRepository } from "../interfaces/user-repository.interface";

export class ListUsersUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(tenantId: string): Promise<TenantMemberData[]> {
    return this.userRepo.list(tenantId);
  }
}
