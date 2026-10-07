import { PrismaBolnaApiKeyRepository } from "./infrastructure/repositories/prisma-bolna-api-key.repository";
import type { BolnaApiKeyRepository } from "./application/interfaces/bolna-api-key-repository.interface";

// Use Cases
import { CreateBolnaApiKeyUseCase } from "./application/use-cases/create-bolna-api-key.use-case";
import { ListBolnaApiKeysUseCase } from "./application/use-cases/list-bolna-api-keys.use-case";
import { AutoAssignKeyUseCase } from "./application/use-cases/auto-assign-key.use-case";
import { DeactivateBolnaApiKeyUseCase } from "./application/use-cases/deactivate-bolna-api-key.use-case";
import { ActivateBolnaApiKeyUseCase } from "./application/use-cases/activate-bolna-api-key.use-case";
import { UpdateBolnaApiKeyUseCase } from "./application/use-cases/update-bolna-api-key.use-case";
import { RefreshBolnaProfileUseCase } from "./application/use-cases/refresh-bolna-profile.use-case";
import { ListKeyTenantsUseCase } from "./application/use-cases/list-key-tenants.use-case";
import { SwitchTenantWorkspaceUseCase } from "./application/use-cases/switch-tenant-workspace.use-case";
import { GetSwitchReadinessUseCase } from "./application/use-cases/get-switch-readiness.use-case";
import { GetWorkspaceSwitchStatusUseCase } from "./application/use-cases/get-workspace-switch-status.use-case";

// Presentation & Background Jobs
import { AdminBolnaApiKeyController } from "./presentation/admin-bolna-api-key.controller";
import { AgentCloneScheduler } from "./infrastructure/jobs/agent-clone.scheduler";
import { AgentCloneWorker } from "./infrastructure/jobs/agent-clone.worker";

import type { AssistantRepository } from "../assistants/application/interfaces/assistant-repository.interface";
import type { PlatformAgentRepository } from "../platform-agents/application/interfaces/platform-agent-repository.interface";
import type { BolnaTemplateProvider } from "../platform-agents/application/interfaces/bolna-template-provider.interface";
import type { CloneAgentToWorkspaceUseCase } from "../platform-agents/application/use-cases/clone-agent-to-workspace.use-case";
import type { Logger } from "../../shared/logging/logger.interface";

export interface BolnaApiKeyModuleDeps {
  assistantRepo: AssistantRepository;
  platformAgentRepo: PlatformAgentRepository;
  templateProvider: BolnaTemplateProvider;
  cloneAgentUseCase: CloneAgentToWorkspaceUseCase;
  logger?: Logger;
}

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

export function buildBolnaApiKeyModule(
  deps: BolnaApiKeyModuleDeps,
): BolnaApiKeyModule {
  const repository = new PrismaBolnaApiKeyRepository();
  const log = deps.logger?.child({ module: "bolna-api-keys" });

  // 1. Core Profile & CRUD Use Cases
  const createKeyUseCase = new CreateBolnaApiKeyUseCase(
    repository,
    deps.templateProvider,
    log,
  );
  const listKeysUseCase = new ListBolnaApiKeysUseCase(repository);
  const autoAssignKey = new AutoAssignKeyUseCase(repository);
  const deactivateKeyUseCase = new DeactivateBolnaApiKeyUseCase(repository);
  const activateKeyUseCase = new ActivateBolnaApiKeyUseCase(repository);
  const updateKeyUseCase = new UpdateBolnaApiKeyUseCase(
    repository,
    deps.templateProvider,
    log,
  );
  const refreshProfileUseCase = new RefreshBolnaProfileUseCase(
    repository,
    deps.templateProvider,
    log,
  );
  const listKeyTenantsUseCase = new ListKeyTenantsUseCase(repository);

  // 2. Migration & Workspace Switching Use Cases
  const getReadinessUseCase = new GetSwitchReadinessUseCase(repository);
  const switchWorkspaceUseCase = new SwitchTenantWorkspaceUseCase(
    repository,
    getReadinessUseCase,
    log,
  );
  const getStatusUseCase = new GetWorkspaceSwitchStatusUseCase();

  // 3. Controller
  const adminController = new AdminBolnaApiKeyController(
    createKeyUseCase,
    listKeysUseCase,
    deactivateKeyUseCase,
    activateKeyUseCase,
    updateKeyUseCase,
    refreshProfileUseCase,
    listKeyTenantsUseCase,
    switchWorkspaceUseCase,
    getReadinessUseCase,
    getStatusUseCase,
  );

  // 4. Background Scheduler & Worker
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
      autoAssignKey,
    },
    adminController,
    schedulers: {
      agentClone: agentCloneScheduler,
    },
  };
}
