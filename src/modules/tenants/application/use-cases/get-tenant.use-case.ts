import { TenantNotFoundError } from "../../domain/tenant.errors";
import { type TenantRepository } from "../interfaces/tenant-repository.interface";

export class GetTenantUseCase {
  constructor(private readonly tenantRepo: TenantRepository) {}

  async execute(id: string) {
    const tenant = await this.tenantRepo.findById(id);
    if (!tenant) throw new TenantNotFoundError();
    return tenant;
  }
}
