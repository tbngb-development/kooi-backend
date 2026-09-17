import { PrismaPlatformAgentRepository } from "./infrastructure/repositories/prisma-platform-agent.repository";
import { BolnaTemplateProviderImpl } from "./infrastructure/services/bolna-template.provider";
import { PrismaExtractionRepository } from "../extractions/infrastructure/repositories/prisma-extraction.repository";
import { PrismaBolnaApiKeyRepository } from "../bolna-api-keys/infrastructure/repositories/prisma-bolna-api-key.repository";
import { BolnaExtractionProviderImpl } from "../extractions/infrastructure/services/bolna-extraction.provider";
import { BolnaExtractionSyncServiceImpl } from "./infrastructure/services/bolna-extraction-sync.service";

// Use Case Imports
import { RegisterPlatformAgentUseCase } from "./application/use-cases/register-platform-agent.use-case";
import { SyncPlatformAgentUseCase } from "./application/use-cases/sync-platform-agent.use-case";
import { UpdatePlatformAgentUseCase } from "./application/use-cases/update-platform-agent.use-case";
import { GetPlatformAgentUseCase } from "./application/use-cases/get-platform-agent.use-case";
import { ListPlatformAgentsUseCase } from "./application/use-cases/list-platform-agents.use-case";
import { DeletePlatformAgentUseCase } from "./application/use-cases/delete-platform-agent.use-case";
import { ListBolnaAgentsUseCase } from "./application/use-cases/list-bolna-agents.use-case";
import { PreviewBolnaAgentUseCase } from "./application/use-cases/preview-bolna-agent.use-case";
import { ImportFromBolnaUseCase } from "./application/use-cases/import-from-bolna.use-case";
import { SyncBlueprintUseCase } from "./application/use-cases/sync-blueprint.use-case";

import { AssignCategoryToAgentUseCase } from "./application/use-cases/assign-category-to-agent.use-case";
import { RemoveCategoryFromAgentUseCase } from "./application/use-cases/remove-category-from-agent.use-case";
import { AssignDispositionToAgentUseCase } from "./application/use-cases/assign-disposition-to-agent.use-case";
import { RemoveDispositionFromAgentUseCase } from "./application/use-cases/remove-disposition-from-agent.use-case";
import { GetAgentExtractionsUseCase } from "./application/use-cases/get-agent-extractions.use-case";
import { SyncExtractionsToBolnaUseCase } from "./application/use-cases/sync-extractions-to-bolna.use-case";

import { AdminPlatformAgentController } from "./presentation/admin-platform-agent.controller";

export interface PlatformAgentModule {
  adminController: AdminPlatformAgentController;
}
export function buildPlatformAgentModule(): PlatformAgentModule {
  const repository = new PrismaPlatformAgentRepository();
  const extractionRepository = new PrismaExtractionRepository();
  const apiKeyRepository = new PrismaBolnaApiKeyRepository();

  const templateProvider = new BolnaTemplateProviderImpl(apiKeyRepository);

  // Injected with apiKeyRepository for workspace isolation
  const bolnaExtractionProvider = new BolnaExtractionProviderImpl(
    apiKeyRepository,
  );
  const bolnaExtractionSyncService = new BolnaExtractionSyncServiceImpl(
    bolnaExtractionProvider,
  );

  return {
    adminController: new AdminPlatformAgentController(
      new RegisterPlatformAgentUseCase(repository, templateProvider),
      new SyncPlatformAgentUseCase(repository, templateProvider),
      new UpdatePlatformAgentUseCase(repository),
      new GetPlatformAgentUseCase(repository),
      new ListPlatformAgentsUseCase(repository),
      new DeletePlatformAgentUseCase(repository),
      new ListBolnaAgentsUseCase(apiKeyRepository, repository),
      new PreviewBolnaAgentUseCase(
        apiKeyRepository,
        repository,
        extractionRepository,
      ),
      new ImportFromBolnaUseCase(
        repository,
        extractionRepository,
        templateProvider,
        apiKeyRepository,
      ),
      new SyncBlueprintUseCase(
        repository,
        extractionRepository,
        templateProvider,
      ),
      new AssignCategoryToAgentUseCase(repository, extractionRepository),
      new RemoveCategoryFromAgentUseCase(repository),
      new AssignDispositionToAgentUseCase(repository, extractionRepository),
      new RemoveDispositionFromAgentUseCase(repository, extractionRepository),
      new GetAgentExtractionsUseCase(repository),
      new SyncExtractionsToBolnaUseCase(
        repository,
        extractionRepository,
        bolnaExtractionSyncService,
      ),
    ),
  };
}
