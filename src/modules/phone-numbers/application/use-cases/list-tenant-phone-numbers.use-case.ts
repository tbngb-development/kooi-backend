import type { IPhoneNumberRepository } from "../interfaces/phone-number-repository.interface";
import type { PhoneNumberDetailDto } from "../dto/phone-number.dto";

export class ListTenantPhoneNumbersUseCase {
  constructor(private readonly repo: IPhoneNumberRepository) {}

  async execute(tenantId: string): Promise<PhoneNumberDetailDto[]> {
    return this.repo.findByTenantId(tenantId);
  }
}
