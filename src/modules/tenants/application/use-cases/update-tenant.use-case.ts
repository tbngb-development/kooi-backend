import { type TenantRepository } from "../interfaces/tenant-repository.interface";
import { type UpdateTenantInput } from "../dto/tenant.dto";
import { TenantNotFoundError } from "../../domain/tenant.errors";

export class UpdateTenantUseCase {
  constructor(private readonly tenantRepo: TenantRepository) {}

  async execute(id: string, input: UpdateTenantInput) {
    const tenant = await this.tenantRepo.findById(id);
    if (!tenant) throw new TenantNotFoundError();

    return this.tenantRepo.update(id, input);
  }
}
