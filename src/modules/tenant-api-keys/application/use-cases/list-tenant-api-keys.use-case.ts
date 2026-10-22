import type { ITenantApiKeyRepository } from "../interfaces/tenant-api-key-repository.interface";
import type { TenantApiKeyListResponseDto } from "../dto/tenant-api-key.dto";
import { TenantApiKeyMapper } from "../mappers/tenant-api-key.mapper";

export class ListTenantApiKeysUseCase {
  constructor(private readonly repository: ITenantApiKeyRepository) {}

  async execute(
    tenantId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<TenantApiKeyListResponseDto> {
    const validPage = Math.max(1, page);
    const validLimit = Math.min(100, Math.max(1, limit));

    const { items, total } = await this.repository.listByTenantId(
      tenantId,
      validPage,
      validLimit,
    );

    const totalPages = Math.ceil(total / validLimit) || 1;

    return {
      items: items.map((item) => TenantApiKeyMapper.toListItemDto(item)),
      pagination: {
        page: validPage,
        limit: validLimit,
        total,
        totalPages,
      },
    };
  }
}
