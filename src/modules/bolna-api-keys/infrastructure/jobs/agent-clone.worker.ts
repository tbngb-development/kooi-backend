import type { Job } from "bull";
import prisma from "../../../../shared/config/database/prisma";
import type { AssistantRepository } from "../../../assistants/application/interfaces/assistant-repository.interface";
import type { PlatformAgentRepository } from "../../../platform-agents/application/interfaces/platform-agent-repository.interface";
import type { BolnaTemplateProvider } from "../../../platform-agents/application/interfaces/bolna-template-provider.interface";
import type { CloneAgentToWorkspaceUseCase } from "../../../platform-agents/application/use-cases/clone-agent-to-workspace.use-case";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface AgentCloneJobData {
  tenantId: string;
  oldKeyId: string | null;
  targetKeyId: string;
}

export class AgentCloneWorker {
  private readonly log: Logger | undefined;

  constructor(
    private readonly assistantRepo: AssistantRepository,
    private readonly platformAgentRepo: PlatformAgentRepository,
    private readonly templateProvider: BolnaTemplateProvider,
    private readonly cloneAgentUseCase: CloneAgentToWorkspaceUseCase,
    logger?: Logger,
  ) {
    this.log = logger?.child({ component: "AgentCloneWorker" });
  }

  async process(job: Job<AgentCloneJobData>): Promise<void> {
    const { tenantId, oldKeyId, targetKeyId } = job.data;

    this.log?.info("Starting tenant workspace switch migration", {
      action: "agent_clone.worker.start",
      jobId: job.id ? String(job.id): undefined,
      tenantId,
      oldKeyId,
      targetKeyId,
      attempt: job.attemptsMade + 1,
    });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        workspaceSwitchStatus: true,
        bolnaApiKeyId: true,
      },
    });

    if (!tenant) {
      this.log?.warn("Tenant deleted before migration", {
        action: "agent_clone.worker.aborted",
        tenantId,
      });
      return;
    }

    if (
      tenant.bolnaApiKeyId === targetKeyId &&
      tenant.workspaceSwitchStatus === "IDLE"
    ) {
      this.log?.info("Tenant already on target key", {
        action: "agent_clone.worker.already_done",
        tenantId,
      });
      return;
    }

    const assistants = await this.assistantRepo.findByTenantId(tenantId);
    const createdPlatformAgentIds: string[] = [];
    const createdBolnaAgentIds: string[] = [];
    const originalAssistantMap = new Map<string, string>();

    try {
      for (const assistant of assistants) {
        originalAssistantMap.set(assistant.id, assistant.platformAgentId);

        this.log?.info("Cloning assistant platform agent", {
          action: "agent_clone.worker.clone",
          assistantId: assistant.id,
          sourcePlatformAgentId: assistant.platformAgentId,
        });

        const { clonedPlatformAgent, bolnaAgentId } =
          await this.cloneAgentUseCase.execute({
            sourcePlatformAgentId: assistant.platformAgentId,
            targetApiKeyId: targetKeyId,
            tenantName: tenant.name,
          });

        createdPlatformAgentIds.push(clonedPlatformAgent.id);
        createdBolnaAgentIds.push(bolnaAgentId);

        await this.assistantRepo.repointPlatformAgent(
          assistant.id,
          clonedPlatformAgent.id,
        );

        this.log?.info("Assistant repointed", {
          action: "agent_clone.worker.repointed",
          assistantId: assistant.id,
          newPlatformAgentId: clonedPlatformAgent.id,
        });
      }

      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          bolnaApiKeyId: targetKeyId,
          workspaceSwitchStatus: "IDLE",
          workspaceSwitchError: null,
          workspaceSwitchJobId: null,
        },
      });

      this.log?.info("Workspace switch completed", {
        action: "agent_clone.worker.complete",
        tenantId,
        targetKeyId,
        clonedCount: assistants.length,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      this.log?.error("Workspace switch failed, rolling back", err, {
        action: "agent_clone.worker.error",
        tenantId,
        attempt: job.attemptsMade + 1,
        errorMessage,
      });

      await this.rollback({
        tenantId,
        targetKeyId,
        originalAssistantMap,
        createdPlatformAgentIds,
        createdBolnaAgentIds,
        errorMessage,
      });

      throw err;
    }
  }

  private async rollback(params: {
    tenantId: string;
    targetKeyId: string;
    originalAssistantMap: Map<string, string>;
    createdPlatformAgentIds: string[];
    createdBolnaAgentIds: string[];
    errorMessage: string;
  }): Promise<void> {
    this.log?.warn("Executing rollback", {
      action: "agent_clone.worker.rollback_start",
      tenantId: params.tenantId,
    });

    for (const [assistantId, originalPaId] of params.originalAssistantMap) {
      try {
        await this.assistantRepo.repointPlatformAgent(
          assistantId,
          originalPaId,
        );
      } catch (e) {
        this.log?.error("Rollback: restore assistant failed", e, {
          assistantId,
        });
      }
    }

    for (const paId of params.createdPlatformAgentIds) {
      try {
        await this.platformAgentRepo.deleteById(paId);
      } catch (e) {
        this.log?.error("Rollback: delete PA failed", e, { paId });
      }
    }

    for (const bolnaId of params.createdBolnaAgentIds) {
      try {
        await this.templateProvider.deleteAgent(bolnaId, params.targetKeyId);
      } catch {
        this.log?.warn("Rollback: orphaned Bolna agent", { bolnaId });
      }
    }

    try {
      await prisma.tenant.update({
        where: { id: params.tenantId },
        data: {
          workspaceSwitchStatus: "FAILED",
          workspaceSwitchError: params.errorMessage,
          workspaceSwitchJobId: null,
        },
      });
    } catch (e) {
      this.log?.error("Rollback: update tenant status failed", e, {
        tenantId: params.tenantId,
      });
    }

    this.log?.info("Rollback complete", {
      action: "agent_clone.worker.rollback_done",
      tenantId: params.tenantId,
    });
  }
}
