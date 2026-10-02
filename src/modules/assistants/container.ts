import { PrismaAssistantRepository } from "./infrastructure/repositories/prisma-assistant.repository";
import { PrismaPlatformAgentRepository } from "../platform-agents/infrastructure/repositories/prisma-platform-agent.repository";
import { PrismaBolnaApiKeyRepository } from "../bolna-api-keys/infrastructure/repositories/prisma-bolna-api-key.repository";
import { BolnaAgentProviderImpl } from "./infrastructure/services/bolna-agent.provider";
import { ListAssistantsUseCase } from "./application/use-cases/list-assistants.use-case";
import { ListBolnaAgentsUseCase } from "./application/use-cases/list-bolna-agents.use-case";
import { GetAssistantUseCase } from "./application/use-cases/get-assistant.use-case";
import { RegisterAssistantUseCase } from "./application/use-cases/register-assistant.use-case";
import { UpdateAssistantUseCase } from "./application/use-cases/update-assistant.use-case";
import { DeleteAssistantUseCase } from "./application/use-cases/delete-assistant.use-case";
import { TenantAssistantController } from "./presentation/tenant-assistant.controller";
import { AdminAssistantController } from "./presentation/admin-assistant.controller";
import type { IBolnaClientFactory } from "../../shared/config/external/bolna/bolna-client.factory";

export interface AssistantModuleDeps {
  bolnaClientFactory: IBolnaClientFactory;
}

export interface AssistantModule {
  adminController: AdminAssistantController;
  tenantController: TenantAssistantController;
}

export function buildAssistantModule(
  deps: AssistantModuleDeps,
): AssistantModule {
  const repository = new PrismaAssistantRepository();
  const platformAgentRepo = new PrismaPlatformAgentRepository();
  const apiKeyRepo = new PrismaBolnaApiKeyRepository();
  const bolnaProvider = new BolnaAgentProviderImpl(deps.bolnaClientFactory);

  const listAssistants = new ListAssistantsUseCase(repository);
  const getAssistant = new GetAssistantUseCase(repository);

  return {
    tenantController: new TenantAssistantController(
      listAssistants,
      getAssistant,
    ),
    adminController: new AdminAssistantController(
      listAssistants,
      new ListBolnaAgentsUseCase(bolnaProvider),
      getAssistant,
      new RegisterAssistantUseCase(repository, platformAgentRepo, apiKeyRepo),
      new UpdateAssistantUseCase(repository),
      new DeleteAssistantUseCase(repository),
    ),
  };
}
