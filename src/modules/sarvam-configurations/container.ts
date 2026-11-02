import { PrismaSarvamConfigurationRepository } from "./infrastructure/repositories/prisma-sarvam-configuration.repository";
import { AesSarvamEncryptionService } from "./infrastructure/services/aes-sarvam-encryption.service";
import { SarvamConfigurationMapper } from "./application/mappers/sarvam-configuration.mapper";
import { CreateSarvamConfigurationUseCase } from "./application/use-cases/create-sarvam-configuration.use-case";
import { UpdateSarvamConfigurationUseCase } from "./application/use-cases/update-sarvam-configuration.use-case";
import { GetSarvamConfigurationUseCase } from "./application/use-cases/get-sarvam-configuration.use-case";
import { ListSarvamConfigurationsUseCase } from "./application/use-cases/list-sarvam-configurations.use-case";
import { DeleteSarvamConfigurationUseCase } from "./application/use-cases/delete-sarvam-configuration.use-case";
import {
  SarvamCredentialService,
  type ISarvamCredentialService,
} from "./application/services/sarvam-credential.service";
import { AdminSarvamConfigurationController } from "./presentation/admin-sarvam-configuration.controller";
import type { ISarvamConfigurationRepository } from "./application/interfaces/sarvam-configuration-repository.interface";
import type { ISarvamEncryptionService } from "./application/interfaces/sarvam-encryption-service.interface";
import type { Logger } from "../../shared/logging/logger.interface";

export interface SarvamConfigurationModuleDeps {
  encryptionSecret: string;
  logger?: Logger;
}

export interface SarvamConfigurationModule {
  repository: ISarvamConfigurationRepository;
  encryptionService: ISarvamEncryptionService;
  credentialService: ISarvamCredentialService;
  adminController: AdminSarvamConfigurationController;
  useCases: {
    create: CreateSarvamConfigurationUseCase;
    update: UpdateSarvamConfigurationUseCase;
    get: GetSarvamConfigurationUseCase;
    list: ListSarvamConfigurationsUseCase;
    delete: DeleteSarvamConfigurationUseCase;
  };
}

export function buildSarvamConfigurationModule(
  deps: SarvamConfigurationModuleDeps,
): SarvamConfigurationModule {
  const repository = new PrismaSarvamConfigurationRepository();
  const encryptionService = new AesSarvamEncryptionService(
    deps.encryptionSecret,
  );
  const mapper = new SarvamConfigurationMapper(encryptionService);
  const log = deps.logger?.child({ module: "sarvam-configurations" });

  const createUseCase = new CreateSarvamConfigurationUseCase(
    repository,
    encryptionService,
    mapper,
    log,
  );
  const updateUseCase = new UpdateSarvamConfigurationUseCase(
    repository,
    encryptionService,
    mapper,
    log,
  );
  const getUseCase = new GetSarvamConfigurationUseCase(repository, mapper);
  const listUseCase = new ListSarvamConfigurationsUseCase(repository, mapper);
  const deleteUseCase = new DeleteSarvamConfigurationUseCase(repository, log);

  const credentialService = new SarvamCredentialService(
    repository,
    encryptionService,
    log,
  );

  const adminController = new AdminSarvamConfigurationController(
    createUseCase,
    updateUseCase,
    getUseCase,
    listUseCase,
    deleteUseCase,
  );

  return {
    repository,
    encryptionService,
    credentialService,
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

