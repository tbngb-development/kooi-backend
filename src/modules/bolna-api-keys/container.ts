import { PrismaBolnaApiKeyRepository } from "./infrastructure/repositories/prisma-bolna-api-key.repository";
import type { BolnaApiKeyRepository } from "./application/interfaces/bolna-api-key-repository.interface";
import { CreateBolnaApiKeyUseCase } from "./application/use-cases/create-bolna-api-key.use-case";
import { ListBolnaApiKeysUseCase } from "./application/use-cases/list-bolna-api-keys.use-case";
import { AutoAssignKeyUseCase } from "./application/use-cases/auto-assign-key.use-case";
import { DeactivateBolnaApiKeyUseCase } from "./application/use-cases/deactivate-bolna-api-key.use-case";
import { SwitchTenantWorkspaceUseCase } from "./application/use-cases/switch-tenant-workspace.use-case";
import { GetSwitchReadinessUseCase } from "./application/use-cases/get-switch-readiness.use-case";
import { GetWorkspaceSwitchStatusUseCase } from "./application/use-cases/get-workspace-switch-status.use-case";
import { AdminBolnaApiKeyController } from "./presentation/admin-bolna-api-key.controller";
import { AgentCloneScheduler } from "./infrastructure/jobs/agent-clone.scheduler";
import { AgentCloneWorker } from "./infrastructure/jobs/agent-clone.worker";
import type { AssistantRepository } from "../assistants/application/interfaces/assistant-repository.interface";
import type { PlatformAgentRepository } from "../platform-agents/application/interfaces/platform-agent-repository.interface";
import type { BolnaTemplateProvider } from "../platform-agents/application/interfaces/bolna-template-provider.interface";
import type { CloneAgentToWorkspaceUseCase } from "../platform-agents/application/use-cases/clone-agent-to-workspace.use-case";
import type { Logger } from "../../shared/logging/logger.interface";

export interface BolnaApiKeyModule {
  repository: BolnaApiKeyRepository;
  useCases: {
    autoAssignKey: AutoAssignKeyUseCase;
  };
  adminController: AdminBolnaApiKeyController;
  schedulers: {
    agentClone: AgentCloneScheduler;
  };
}

export function buildBolnaApiKeyModule(deps: {
  assistantRepo: AssistantRepository;
  platformAgentRepo: PlatformAgentRepository;
  templateProvider: BolnaTemplateProvider;
  cloneAgentUseCase: CloneAgentToWorkspaceUseCase;
  logger?: Logger;
}): BolnaApiKeyModule {
  const repository = new PrismaBolnaApiKeyRepository();
  const log = deps.logger?.child({ module: "bolna-api-keys" });

  const getSwitchReadiness = new GetSwitchReadinessUseCase(repository);
  const switchTenantWorkspace = new SwitchTenantWorkspaceUseCase(
    repository,
    getSwitchReadiness,
    log,
  );
  const getWorkspaceSwitchStatus = new GetWorkspaceSwitchStatusUseCase();

  const adminController = new AdminBolnaApiKeyController(
    new CreateBolnaApiKeyUseCase(repository),
    new ListBolnaApiKeysUseCase(repository),
    new DeactivateBolnaApiKeyUseCase(repository),
    switchTenantWorkspace,
    getSwitchReadiness,
    getWorkspaceSwitchStatus,
  );

  const agentCloneWorker = new AgentCloneWorker(
    deps.assistantRepo,
    deps.platformAgentRepo,
    deps.templateProvider,
    deps.cloneAgentUseCase,
    log,
  );
  const agentCloneScheduler = new AgentCloneScheduler(agentCloneWorker, log);

  return {
    repository,
    useCases: {
      autoAssignKey: new AutoAssignKeyUseCase(repository),
    },
    adminController,
    schedulers: {
      agentClone: agentCloneScheduler,
    },
  };
}
