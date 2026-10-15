import type { IPhoneNumberRepository } from "../interfaces/phone-number-repository.interface";
import type { PhoneNumberDetailDto } from "../dto/phone-number.dto";

export class GetTenantPhoneNumberUseCase {
  constructor(private readonly repo: IPhoneNumberRepository) {}

  async execute(tenantId: string): Promise<PhoneNumberDetailDto | null> {
    return this.repo.findFirstByTenantId(tenantId);
  }
}
