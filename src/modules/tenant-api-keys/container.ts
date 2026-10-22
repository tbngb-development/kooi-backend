import type { Logger } from "../../shared/logging/logger.interface";
import { PrismaTenantApiKeyRepository } from "./infrastructure/repositories/prisma-tenant-api-key.repository";
import { ApiKeyCryptoService } from "./infrastructure/services/api-key-crypto.service";
import { CreateTenantApiKeyUseCase } from "./application/use-cases/create-tenant-api-key.use-case";
import { ListTenantApiKeysUseCase } from "./application/use-cases/list-tenant-api-keys.use-case";
import { DeleteTenantApiKeyUseCase } from "./application/use-cases/delete-tenant-api-key.use-case";
import { VerifyTenantApiKeyUseCase } from "./application/use-cases/verify-tenant-api-key.use-case";
import { TenantApiKeyController } from "./presentation/tenant-api-key.controller";
import { TenantApiKeyAuthMiddleware } from "../../shared/middleware/tenant-api-key-auth";

export interface TenantApiKeyModule {
  controller: TenantApiKeyController;
  repository: PrismaTenantApiKeyRepository;
  cryptoService: ApiKeyCryptoService;
  useCases: {
    create: CreateTenantApiKeyUseCase;
    list: ListTenantApiKeysUseCase;
    delete: DeleteTenantApiKeyUseCase;
    verify: VerifyTenantApiKeyUseCase;
  };
  authMiddleware: TenantApiKeyAuthMiddleware;
}

export function buildTenantApiKeyModule(logger?: Logger): TenantApiKeyModule {
  const repository = new PrismaTenantApiKeyRepository();
  const cryptoService = new ApiKeyCryptoService();

  const create = new CreateTenantApiKeyUseCase(repository, cryptoService, logger);
  const list = new ListTenantApiKeysUseCase(repository);
  const deleteUseCase = new DeleteTenantApiKeyUseCase(repository, logger);
  const verify = new VerifyTenantApiKeyUseCase(repository, cryptoService, logger);

  const controller = new TenantApiKeyController(create, list, deleteUseCase);
  const authMiddleware = new TenantApiKeyAuthMiddleware(verify, logger);

  return {
    controller,
    repository,
    cryptoService,
    useCases: {
      create,
      list,
      delete: deleteUseCase,
      verify,
    },
    authMiddleware,
  };
}
