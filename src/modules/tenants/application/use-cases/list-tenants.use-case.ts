import {
  type TenantRepository,
  type TenantWithCounts,
} from "../interfaces/tenant-repository.interface";

export class ListTenantsUseCase {
  constructor(private readonly tenantRepo: TenantRepository) {}

  async execute(): Promise<TenantWithCounts[]> {
    return this.tenantRepo.list();
  }
}
    