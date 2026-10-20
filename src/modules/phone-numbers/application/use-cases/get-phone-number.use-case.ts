import type { IPhoneNumberRepository } from "../interfaces/phone-number-repository.interface";
import type { PhoneNumberDetailDto } from "../dto/phone-number.dto";
import { NotFoundError } from "../../../../shared/errors";

export class GetPhoneNumberUseCase {
  constructor(private readonly repo: IPhoneNumberRepository) {}

  async execute(id: string): Promise<PhoneNumberDetailDto> {
    const item = await this.repo.findById(id);
    if (!item) {
      throw new NotFoundError(`Phone number with ID "${id}" not found`);
    }
    return item;
  }
}
