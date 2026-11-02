import type { ISarvamConfigurationRepository } from "../interfaces/sarvam-configuration-repository.interface";
import type { SarvamConfigurationMapper } from "../mappers/sarvam-configuration.mapper";
import type {
  ListSarvamConfigurationsQueryDTO,
  PaginatedSarvamConfigurationsResponseDTO,
} from "../dto/sarvam-configuration.dto";

export class ListSarvamConfigurationsUseCase {
  constructor(
    private readonly repository: ISarvamConfigurationRepository,
    private readonly mapper: SarvamConfigurationMapper,
  ) {}

  async execute(
    query: ListSarvamConfigurationsQueryDTO,
  ): Promise<PaginatedSarvamConfigurationsResponseDTO> {
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

