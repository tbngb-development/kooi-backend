import type { ISarvamApiKeyRepository } from "../sarvam-api-keys/application/interfaces/sarvam-api-key-repository.interface";
import type { AuthenticateMiddleware } from "../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../shared/middleware/authorize";
import type { Logger } from "../../shared/logging/logger.interface";
import { PrismaSarvamAgentRepository } from "./infrastructure/repositories/prisma-sarvam-agent.repository";
import { PrismaSarvamAgentOverrideRepository } from "./infrastructure/repositories/prisma-sarvam-agent-override.repository";
import { SarvamAgentMapper } from "./application/mappers/sarvam-agent.mapper";
import { CreateSarvamAgentUseCase } from "./application/use-cases/admin/create-sarvam-agent.use-case";
import { GetSarvamAgentUseCase } from "./application/use-cases/admin/get-sarvam-agent.use-case";
import { ListSarvamAgentsUseCase } from "./application/use-cases/admin/list-sarvam-agents.use-case";
import { UpdateSarvamAgentUseCase } from "./application/use-cases/admin/update-sarvam-agent.use-case";
import { ArchiveSarvamAgentUseCase } from "./application/use-cases/admin/archive-sarvam-agent.use-case";
import { UploadSarvamAgentAudioUseCase } from "./application/use-cases/admin/upload-sarvam-agent-audio.use-case";
import { cloudinaryService } from "../../shared/services/cloudinary.service";
import { ListTenantSarvamAgentsUseCase } from "./application/use-cases/tenant/list-tenant-sarvam-agents.use-case";
import { GetTenantSarvamAgentUseCase } from "./application/use-cases/tenant/get-tenant-sarvam-agent.use-case";
import { UpdateTenantSarvamAgentVariablesUseCase } from "./application/use-cases/tenant/update-tenant-sarvam-agent-variables.use-case";
import { UpdateTenantSarvamAgentWelcomeMessageUseCase } from "./application/use-cases/tenant/update-tenant-sarvam-agent-welcome-message.use-case";
import { AdminSarvamAgentController } from "./presentation/admin/admin-sarvam-agent.controller";
import { TenantSarvamAgentController } from "./presentation/tenant/tenant-sarvam-agent.controller";
import { buildAdminSarvamAgentRoutes } from "./presentation/admin/admin-sarvam-agent.routes";
import { buildTenantSarvamAgentRoutes } from "./presentation/tenant/tenant-sarvam-agent.routes";

export interface SarvamAgentModuleConfig {
  sarvamApiKeyRepository: ISarvamApiKeyRepository;
  authenticate: AuthenticateMiddleware;
  authorize: AuthorizeMiddleware;
  logger?: Logger;
}

export interface SarvamAgentModule {
  adminController: AdminSarvamAgentController;
  tenantController: TenantSarvamAgentController;
  repository: PrismaSarvamAgentRepository;
  overrideRepository: PrismaSarvamAgentOverrideRepository;
  buildAdminRoutes: () => ReturnType<typeof buildAdminSarvamAgentRoutes>;
  buildTenantRoutes: () => ReturnType<typeof buildTenantSarvamAgentRoutes>;
}

export function buildSarvamAgentModule(
  config: SarvamAgentModuleConfig,
): SarvamAgentModule {
  const repository = new PrismaSarvamAgentRepository();
  const overrideRepository = new PrismaSarvamAgentOverrideRepository();
  const mapper = new SarvamAgentMapper();

  // Admin Use Cases
  const createUseCase = new CreateSarvamAgentUseCase(
    repository,
    config.sarvamApiKeyRepository,
    mapper,
    config.logger,
  );
  const getUseCase = new GetSarvamAgentUseCase(repository, mapper);
  const listUseCase = new ListSarvamAgentsUseCase(repository, mapper);
  const updateUseCase = new UpdateSarvamAgentUseCase(
    repository,
    config.sarvamApiKeyRepository,
    mapper,
    config.logger,
  );
  const archiveUseCase = new ArchiveSarvamAgentUseCase(
    repository,
    mapper,
    config.logger,
  );
  const uploadAudioUseCase = new UploadSarvamAgentAudioUseCase(
    cloudinaryService,
    config.logger,
  );

  // Tenant Use Cases
  const listTenantUseCase = new ListTenantSarvamAgentsUseCase(repository, mapper);
  const getTenantUseCase = new GetTenantSarvamAgentUseCase(
    repository,
    overrideRepository,
    mapper,
  );
  const updateVariablesUseCase = new UpdateTenantSarvamAgentVariablesUseCase(
    repository,
    overrideRepository,
    mapper,
    config.logger,
  );
  const updateWelcomeMessageUseCase =
    new UpdateTenantSarvamAgentWelcomeMessageUseCase(
      repository,
      overrideRepository,
      mapper,
      config.logger,
    );

  // Controllers
  const adminController = new AdminSarvamAgentController(
    createUseCase,
    updateUseCase,
    getUseCase,
    listUseCase,
    archiveUseCase,
    uploadAudioUseCase,
  );

  const tenantController = new TenantSarvamAgentController(
    listTenantUseCase,
    getTenantUseCase,
    updateVariablesUseCase,
    updateWelcomeMessageUseCase,
  );

  return {
    adminController,
    tenantController,
    repository,
    overrideRepository,
    buildAdminRoutes: () =>
      buildAdminSarvamAgentRoutes(
        adminController,
        config.authenticate,
        config.authorize,
      ),
    buildTenantRoutes: () =>
      buildTenantSarvamAgentRoutes(tenantController, config.authenticate),
  };
}

