import prisma from "../../../../shared/config/database/prisma";
import type { BolnaApiKeyRepository } from "../interfaces/bolna-api-key-repository.interface";
import { BolnaApiKeyNotFoundError } from "../../domain/errors/bolna-api-key.errors";

export interface SwitchReadinessBlocker {
  type:
    | "ACTIVE_CAMPAIGNS"
    | "ACTIVE_BATCHES"
    | "ACTIVE_CALLS"
    | "MIGRATION_IN_PROGRESS";
  count: number;
  message: string;
}

export interface SwitchReadinessWarning {
  type: "CREATED_BATCHES" | "NO_ASSISTANTS";
  count: number;
  message: string;
}

export interface SwitchReadinessOutput {
  ready: boolean;
  tenant: {
    id: string;
    name: string;
    workspaceSwitchStatus: string;
  };
  currentKey: {
    id: string;
    keyIdentifier: string;
    type: string;
  } | null;
  targetKey: {
    id: string;
    keyIdentifier: string;
    type: string;
  };
  assistantsToCloneCount: number;
  blockers: SwitchReadinessBlocker[];
  warnings: SwitchReadinessWarning[];
}

export class GetSwitchReadinessUseCase {
  constructor(private readonly apiKeyRepo: BolnaApiKeyRepository) {}

  async execute(
    tenantId: string,
    targetKeyId: string,
  ): Promise<SwitchReadinessOutput> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { bolnaApiKey: true },
    });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    const targetKey = await this.apiKeyRepo.findById(targetKeyId);
    if (!targetKey) throw new BolnaApiKeyNotFoundError(targetKeyId);

    const blockers: SwitchReadinessBlocker[] = [];
    const warnings: SwitchReadinessWarning[] = [];

    if (tenant.workspaceSwitchStatus === "CLONING") {
      blockers.push({
        type: "MIGRATION_IN_PROGRESS",
        count: 1,
        message: "A workspace migration is already in progress.",
      });
    }

    const runningCampaigns = await prisma.campaign.count({
      where: { tenantId, status: "RUNNING", isDeleted: false },
    });
    if (runningCampaigns > 0) {
      blockers.push({
        type: "ACTIVE_CAMPAIGNS",
        count: runningCampaigns,
        message: `${runningCampaigns} campaign(s) are RUNNING.`,
      });
    }

    const activeBatches = await prisma.leadBatch.count({
      where: {
        tenantId,
        status: { in: ["RUNNING", "SCHEDULED", "PROCESSING"] },
        isDeleted: false,
      },
    });
    if (activeBatches > 0) {
      blockers.push({
        type: "ACTIVE_BATCHES",
        count: activeBatches,
        message: `${activeBatches} batch(es) are RUNNING/SCHEDULED/PROCESSING.`,
      });
    }

    const activeCalls = await prisma.call.count({
      where: {
        tenantId,
        status: { in: ["PENDING", "CALLING"] },
        isDeleted: false,
      },
    });
    if (activeCalls > 0) {
      blockers.push({
        type: "ACTIVE_CALLS",
        count: activeCalls,
        message: `${activeCalls} call(s) are in progress.`,
      });
    }

    const createdBatches = await prisma.leadBatch.count({
      where: { tenantId, status: "CREATED", isDeleted: false },
    });
    if (createdBatches > 0) {
      warnings.push({
        type: "CREATED_BATCHES",
        count: createdBatches,
        message: `${createdBatches} unstarted batch(es) will run under the new workspace.`,
      });
    }

    const assistantsCount = await prisma.assistant.count({
      where: { tenantId, isDeleted: false },
    });
    if (assistantsCount === 0) {
      warnings.push({
        type: "NO_ASSISTANTS",
        count: 0,
        message: "No active assistants. Only API key will be updated.",
      });
    }

    return {
      ready: blockers.length === 0,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        workspaceSwitchStatus: tenant.workspaceSwitchStatus,
      },
      currentKey: tenant.bolnaApiKey
        ? {
            id: tenant.bolnaApiKey.id,
            keyIdentifier: tenant.bolnaApiKey.keyIdentifier,
            type: tenant.bolnaApiKey.type,
          }
        : null,
      targetKey: {
        id: targetKey.id,
        keyIdentifier: targetKey.keyIdentifier,
        type: targetKey.type,
      },
      assistantsToCloneCount: assistantsCount,
      blockers,
      warnings,
    };
  }
}
