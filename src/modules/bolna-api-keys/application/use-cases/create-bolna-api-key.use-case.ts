import type { BolnaApiKeyRepository } from "../interfaces/bolna-api-key-repository.interface";
import type {
  CreateBolnaApiKeyInput,
  BolnaApiKeyResponse,
} from "../dto/bolna-api-key.dto";
import { encryptKey } from "../../../../shared/utils/encryption";
import { toBolnaApiKeyResponse } from "../mappers/bolna-api-key.mapper";

export class CreateBolnaApiKeyUseCase {
  constructor(private readonly repo: BolnaApiKeyRepository) {}

  async execute(input: CreateBolnaApiKeyInput): Promise<BolnaApiKeyResponse> {
    const encryptedKey = encryptKey(input.plainTextKey);

    const created = await this.repo.create({
      keyIdentifier: input.keyIdentifier,
      encryptedKey,
      type: input.type,
      isPlatformDefault: input.isPlatformDefault ?? false,
      createdBy: input.createdBy,
    });

    return toBolnaApiKeyResponse({ ...created, _count: { tenants: 0 } });
  }
}
