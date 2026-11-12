import { PrismaSarvamApiKeyRepository } from "./infrastructure/repositories/prisma-sarvam-api-key.repository";
import { AesSarvamEncryptionService } from "./infrastructure/services/aes-sarvam-encryption.service";
import { SarvamApiKeyMapper } from "./application/mappers/sarvam-api-key.mapper";
import { CreateSarvamApiKeyUseCase } from "./application/use-cases/create-sarvam-api-key.use-case";
import { UpdateSarvamApiKeyUseCase } from "./application/use-cases/update-sarvam-api-key.use-case";
import { GetSarvamApiKeyUseCase } from "./application/use-cases/get-sarvam-api-key.use-case";
import { ListSarvamApiKeysUseCase } from "./application/use-cases/list-sarvam-api-keys.use-case";
import { DeleteSarvamApiKeyUseCase } from "./application/use-cases/delete-sarvam-api-key.use-case";
import {
  SarvamApiKeyService,
  type ISarvamApiKeyService,
} from "./application/services/sarvam-api-key.service";
import { AdminSarvamApiKeyController } from "./presentation/admin-sarvam-api-key.controller";
import type { ISarvamApiKeyRepository } from "./application/interfaces/sarvam-api-key-repository.interface";
import type { ISarvamApiKeyEncryptionService } from "./application/interfaces/sarvam-api-key-encryption.interface";
import type { Logger } from "../../shared/logging/logger.interface";

export interface SarvamApiKeyModuleDeps {
  encryptionSecret: string;
  logger?: Logger;
}

export interface SarvamApiKeyModule {
  repository: ISarvamApiKeyRepository;
  encryptionService: ISarvamApiKeyEncryptionService;
  apiKeyService: ISarvamApiKeyService;
  credentialService: ISarvamApiKeyService;
  adminController: AdminSarvamApiKeyController;
  useCases: {
    create: CreateSarvamApiKeyUseCase;
    update: UpdateSarvamApiKeyUseCase;
    get: GetSarvamApiKeyUseCase;
    list: ListSarvamApiKeysUseCase;
    delete: DeleteSarvamApiKeyUseCase;
  };
}

export function buildSarvamApiKeyModule(
  deps: SarvamApiKeyModuleDeps,
): SarvamApiKeyModule {
  const repository = new PrismaSarvamApiKeyRepository();
  const encryptionService = new AesSarvamEncryptionService(
    deps.encryptionSecret,
  );
  const mapper = new SarvamApiKeyMapper(encryptionService);
  const log = deps.logger?.child({ module: "sarvam-api-keys" });

  const createUseCase = new CreateSarvamApiKeyUseCase(
    repository,
    encryptionService,
    mapper,
    log,
  );
  const updateUseCase = new UpdateSarvamApiKeyUseCase(
    repository,
    encryptionService,
    mapper,
    log,
  );
  const getUseCase = new GetSarvamApiKeyUseCase(repository, mapper);
  const listUseCase = new ListSarvamApiKeysUseCase(repository, mapper);
  const deleteUseCase = new DeleteSarvamApiKeyUseCase(repository, log);

  const apiKeyService = new SarvamApiKeyService(
    repository,
    encryptionService,
    log,
  );

  const adminController = new AdminSarvamApiKeyController(
    createUseCase,
    updateUseCase,
    getUseCase,
    listUseCase,
    deleteUseCase,
  );

  return {
    repository,
    encryptionService,
    apiKeyService,
    credentialService: apiKeyService,
    adminController,
    useCases: {
      create: createUseCase,
      update: updateUseCase,
      get: getUseCase,
      list: listUseCase,
      delete: deleteUseCase,
    },
  };
}

