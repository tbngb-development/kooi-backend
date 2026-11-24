import type { ISarvamApiKeyRepository } from "../interfaces/sarvam-api-key-repository.interface";
import type { SarvamApiKeyMapper } from "../mappers/sarvam-api-key.mapper";
import type {
  ListSarvamApiKeysQueryDTO,
  PaginatedSarvamApiKeysResponseDTO,
} from "../dto/sarvam-api-key.dto";

export class ListSarvamApiKeysUseCase {
  constructor(
    private readonly repository: ISarvamApiKeyRepository,
    private readonly mapper: SarvamApiKeyMapper,
  ) {}

  async execute(
    query: ListSarvamApiKeysQueryDTO,
  ): Promise<PaginatedSarvamApiKeysResponseDTO> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(100, query.limit ?? 10));

    const { items, total } = await this.repository.list({
      page,
      limit,
      search: query.search,
      tenantId: query.tenantId,
      isActive: query.isActive,
    });

    return {
      items: items.map((item) => this.mapper.toResponseDTO(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}

