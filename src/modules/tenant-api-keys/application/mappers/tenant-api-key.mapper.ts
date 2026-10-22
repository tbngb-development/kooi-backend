import type { TenantApiKeyEntity } from "../../domain/entities/tenant-api-key.entity";
import type {
  CreatedTenantApiKeyResponseDto,
  TenantApiKeyListItemDto,
  ApiKeyCreatorDto,
} from "../dto/tenant-api-key.dto";

export class TenantApiKeyMapper {
  static toCreatedResponseDto(
    entity: TenantApiKeyEntity,
    fullKey: string,
  ): CreatedTenantApiKeyResponseDto {
    return {
      id: entity.id,
      keyIdentifier: entity.keyIdentifier,
      fullKey,
      createdAt: entity.createdAt.toISOString(),
      createdBy: this.mapCreator(entity.createdByUser),
    };
  }

  static toListItemDto(entity: TenantApiKeyEntity): TenantApiKeyListItemDto {
    return {
      id: entity.id,
      keyIdentifier: entity.keyIdentifier,
      maskedKey: this.maskKey(entity.keyIdentifier),
      lastAccessedAt: entity.lastAccessedAt ? entity.lastAccessedAt.toISOString() : null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      createdBy: this.mapCreator(entity.createdByUser),
    };
  }

  static maskKey(keyIdentifier: string): string {
    return `${keyIdentifier}.sec_••••••••`;
  }

  private static mapCreator(
    user?: { id: string; name: string; email: string } | null,
  ): ApiKeyCreatorDto | null {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
    };
  }
}
