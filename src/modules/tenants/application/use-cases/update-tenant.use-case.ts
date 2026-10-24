import { type TenantRepository } from "../interfaces/tenant-repository.interface";
import { type UpdateTenantInput } from "../dto/tenant.dto";
import { TenantNotFoundError } from "../../domain/tenant.errors";

export class UpdateTenantUseCase {
  constructor(private readonly tenantRepo: TenantRepository) {}

  async execute(id: string, input: UpdateTenantInput, adminUserId?: string) {
    const tenant = await this.tenantRepo.findById(id);
    if (!tenant) throw new TenantNotFoundError();

    const dataToUpdate: UpdateTenantInput = { ...input };

    if (input.isActive === false) {
      dataToUpdate.suspendedAt = input.suspendedAt ?? new Date();
      if (adminUserId && !dataToUpdate.suspendedBy) {
        dataToUpdate.suspendedBy = adminUserId;
      }
    } else if (input.isActive === true) {
      dataToUpdate.suspensionReason = null;
      dataToUpdate.suspendedAt = null;
      dataToUpdate.suspendedBy = null;
    }

    return this.tenantRepo.update(id, dataToUpdate);
  }
}
