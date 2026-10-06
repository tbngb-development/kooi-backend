import prisma from "../../../../shared/config/database/prisma";
import type { BolnaApiKeyRepository } from "../interfaces/bolna-api-key-repository.interface";
import type { GetSwitchReadinessUseCase } from "./get-switch-readiness.use-case";
import {
  WorkspaceSwitchAlreadyInProgressError,
  ActiveCampaignsBlockSwitchError,
  ActiveBatchesBlockSwitchError,
  ActiveCallsBlockSwitchError,
  TenantAlreadyOnTargetKeyError,
} from "../../domain/errors/workspace-switch.errors";
import { CannotReassignCustomKeyError } from "../../domain/errors/bolna-api-key.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { getQueue } from "../../../../shared/config/external/queue/queue.factory";

export const AGENT_CLONE_QUEUE_NAME = "agent-clone-workspace-switch";

export class SwitchTenantWorkspaceUseCase {
  constructor(
    private readonly apiKeyRepo: BolnaApiKeyRepository,
    private readonly readinessUseCase: GetSwitchReadinessUseCase,
    private readonly logger?: Logger,
  ) {}

  async execute(tenantId: string, targetKeyId: string) {
    const readiness = await this.readinessUseCase.execute(
      tenantId,
      targetKeyId,
    );

    if (readiness.currentKey?.id === targetKeyId) {
      throw new TenantAlreadyOnTargetKeyError(
        readiness.targetKey.keyIdentifier,
      );
    }

    if (readiness.targetKey.type === "CUSTOM") {
      const currentTenants =
        await this.apiKeyRepo.findTenantIdsUsingKey(targetKeyId);
      if (currentTenants.some((id) => id !== tenantId)) {
        throw new CannotReassignCustomKeyError();
      }
    }

    for (const blocker of readiness.blockers) {
      switch (blocker.type) {
        case "ACTIVE_CAMPAIGNS":
          throw new ActiveCampaignsBlockSwitchError(blocker.count);
        case "ACTIVE_BATCHES":
          throw new ActiveBatchesBlockSwitchError(blocker.count);
        case "ACTIVE_CALLS":
          throw new ActiveCallsBlockSwitchError(blocker.count);
        case "MIGRATION_IN_PROGRESS":
          throw new WorkspaceSwitchAlreadyInProgressError(tenantId);
      }
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        workspaceSwitchStatus: "CLONING",
        workspaceSwitchError: null,
      },
    });

    this.logger?.info("Tenant workspace migration initiated", {
      action: "workspace.switch.initiated",
      tenantId,
      targetKeyId,
      assistantsCount: readiness.assistantsToCloneCount,
    });

    const queue = getQueue(AGENT_CLONE_QUEUE_NAME);
    const job = await queue.add(
      "clone-agents",
      {
        tenantId,
        oldKeyId: readiness.currentKey?.id ?? null,
        targetKeyId,
      },
      {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { workspaceSwitchJobId: String(job.id) },
    });

    return {
      message: "Tenant workspace switch migration queued.",
      jobId: String(job.id),
      status: "CLONING",
      assistantsToClone: readiness.assistantsToCloneCount,
    };
  }
}