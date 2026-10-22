import type { ITenantApiKeyRepository } from "../interfaces/tenant-api-key-repository.interface";
import type { IApiKeyCryptoService } from "../../infrastructure/services/api-key-crypto.service";
import type { CreatedTenantApiKeyResponseDto } from "../dto/tenant-api-key.dto";
import { TenantApiKeyMapper } from "../mappers/tenant-api-key.mapper";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class CreateTenantApiKeyUseCase {
  constructor(
    private readonly repository: ITenantApiKeyRepository,
    private readonly cryptoService: IApiKeyCryptoService,
    private readonly logger?: Logger,
  ) {}

  async execute(
    tenantId: string,
    userId: string,
  ): Promise<CreatedTenantApiKeyResponseDto> {
    const generated = this.cryptoService.generateKey();

    const created = await this.repository.create({
      keyIdentifier: generated.keyIdentifier,
      secretHash: generated.secretHash,
      tenantId,
      createdBy: userId,
    });

    this.logger?.info("Tenant API key created", {
      action: "tenant_api_key.create",
      apiKeyId: created.id,
      keyIdentifier: created.keyIdentifier,
      tenantId,
      userId,
    });

    return TenantApiKeyMapper.toCreatedResponseDto(created, generated.fullKey);
  }
}
