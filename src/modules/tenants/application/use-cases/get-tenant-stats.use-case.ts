import { type TenantRepository } from "../interfaces/tenant-repository.interface";
import { TenantNotFoundError } from "../../domain/tenant.errors";

export class GetTenantStatsUseCase {
  constructor(private readonly tenantRepo: TenantRepository) {}

  async execute(id: string) {
    const tenant = await this.tenantRepo.findById(id);
    if (!tenant) throw new TenantNotFoundError();

    return this.tenantRepo.getStats(id);
  }
}
