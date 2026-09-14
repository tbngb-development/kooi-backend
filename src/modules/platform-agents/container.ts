import { PrismaPlatformAgentRepository } from "./infrastructure/repositories/prisma-platform-agent.repository";
import { BolnaTemplateProviderImpl } from "./infrastructure/services/bolna-template.provider";
import { PrismaExtractionRepository } from "../extractions/infrastructure/repositories/prisma-extraction.repository";
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
import { AdminPlatformAgentController } from "./presentation/admin-platform-agent.controller";

export interface PlatformAgentModule {
  adminController: AdminPlatformAgentController;
}

export function buildPlatformAgentModule(): PlatformAgentModule {
  const repository = new PrismaPlatformAgentRepository();
  const extractionRepository = new PrismaExtractionRepository();
  const templateProvider = new BolnaTemplateProviderImpl();

  return {
    adminController: new AdminPlatformAgentController(
      new RegisterPlatformAgentUseCase(repository, templateProvider),
      new SyncPlatformAgentUseCase(repository, templateProvider),
      new UpdatePlatformAgentUseCase(repository),
      new GetPlatformAgentUseCase(repository),
      new ListPlatformAgentsUseCase(repository),
      new DeletePlatformAgentUseCase(repository),
      new ListBolnaAgentsUseCase(templateProvider),
      new PreviewBolnaAgentUseCase(templateProvider),
      new ImportFromBolnaUseCase(
        repository,
        extractionRepository,
        templateProvider,
      ),
      new SyncBlueprintUseCase(
        repository,
        extractionRepository,
        templateProvider,
      ),
    ),
  };
}
