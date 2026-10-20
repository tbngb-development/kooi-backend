import type { IPhoneNumberRepository } from "../interfaces/phone-number-repository.interface";
import type {
  PhoneNumberFilterDto,
  PhoneNumberListResponseDto,
} from "../dto/phone-number.dto";

export class ListPhoneNumbersUseCase {
  constructor(private readonly repo: IPhoneNumberRepository) {}

  async execute(
    filter: PhoneNumberFilterDto,
  ): Promise<PhoneNumberListResponseDto> {
    const page = Math.max(Number(filter.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filter.limit) || 20, 1), 100);

    const { phoneNumbers, total, stats } = await this.repo.list({
      ...filter,
      page,
      limit,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      phoneNumbers,
      total,
      page,
      limit,
      totalPages,
      stats,
    };
  }
}
