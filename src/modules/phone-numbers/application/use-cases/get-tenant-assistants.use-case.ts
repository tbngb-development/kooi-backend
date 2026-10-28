import type { IPhoneNumberRepository } from "../interfaces/phone-number-repository.interface";
import type { TenantInboundAssistantDto } from "../dto/phone-number.dto";
import { NotFoundError } from "../../../../shared/errors";

export class GetTenantAssistantsUseCase {
  constructor(private readonly repo: IPhoneNumberRepository) {}

  async execute(tenantId: string): Promise<TenantInboundAssistantDto[]> {
    const tenantExists = await this.repo.checkTenantExists(tenantId);
    if (!tenantExists) {
      throw new NotFoundError(`Tenant with ID "${tenantId}" not found`);
    }

    return this.repo.getTenantInboundAssistants(tenantId);
  }
}
