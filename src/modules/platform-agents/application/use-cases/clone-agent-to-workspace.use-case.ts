import crypto from "crypto";
import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { BolnaTemplateProvider } from "../interfaces/bolna-template-provider.interface";
import type { SyncExtractionsToBolnaUseCase } from "./sync-extractions-to-bolna.use-case";
import { PlatformAgentNotFoundError } from "../../domain/errors/platform-agent.errors";
import { mapToCreateAgentPayload } from "../../infrastructure/mappers/agent-config.mapper";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type { PlatformAgent } from "@prisma/client";

export interface CloneAgentInput {
  sourcePlatformAgentId: string;
  targetApiKeyId: string;
  tenantName?: string;
}

export class CloneAgentToWorkspaceUseCase {
  constructor(
    private readonly platformAgentRepo: PlatformAgentRepository,
    private readonly templateProvider: BolnaTemplateProvider,
    private readonly syncExtractionsUseCase?: SyncExtractionsToBolnaUseCase,
    private readonly logger?: Logger,
  ) {}

  async execute(input: CloneAgentInput): Promise<{
    clonedPlatformAgent: PlatformAgent;
    bolnaAgentId: string;
  }> {
    const sourceAgent = await this.platformAgentRepo.findById(
      input.sourcePlatformAgentId,
    );
    if (!sourceAgent) {
      throw new PlatformAgentNotFoundError(input.sourcePlatformAgentId);
    }

    this.logger?.info("Cloning PlatformAgent to new workspace", {
      action: "agent.clone.start",
      sourcePlatformAgentId: sourceAgent.id,
      sourceBolnaId: sourceAgent.bolnaId,
      targetApiKeyId: input.targetApiKeyId,
    });

    const createPayload = mapToCreateAgentPayload(
      sourceAgent.defaultConfig as Record<string, unknown>,
      {
        agentName: sourceAgent.name,
        welcomeMessage: sourceAgent.welcomeMessage,
        systemPrompt: sourceAgent.systemPrompt,
      },
    );

    const bolnaResponse = await this.templateProvider.createAgent(
      createPayload,
      input.targetApiKeyId,
    );

    const newBolnaId = bolnaResponse.agent_id;
    const randomSuffix = crypto.randomBytes(3).toString("hex");
    const uniqueSlug = `${sourceAgent.slug}-copy-${randomSuffix}`;

    const clonedPlatformAgent = await this.platformAgentRepo.cloneFrom({
      sourcePlatformAgentId: sourceAgent.id,
      bolnaId: newBolnaId,
      bolnaApiKeyId: input.targetApiKeyId,
      slug: uniqueSlug,
      name: input.tenantName
        ? `${sourceAgent.name} (${input.tenantName})`
        : `${sourceAgent.name} (Copy)`,
    });

    this.logger?.info("Cloned PlatformAgent created in database", {
      action: "agent.clone.db_created",
      clonedPlatformAgentId: clonedPlatformAgent.id,
      newBolnaId,
      slug: uniqueSlug,
    });

    if (this.syncExtractionsUseCase) {
      try {
        await this.syncExtractionsUseCase.execute(clonedPlatformAgent.id);
        this.logger?.info("Extraction sync completed for cloned agent", {
          action: "agent.clone.extractions_synced",
          clonedPlatformAgentId: clonedPlatformAgent.id,
        });
      } catch (err) {
        this.logger?.warn(
          "Extraction sync failed on cloned agent (non-fatal)",
          {
            action: "agent.clone.extractions_sync_failed",
            clonedPlatformAgentId: clonedPlatformAgent.id,
            error: err instanceof Error ? err.message : String(err),
          },
        );
      }
    }

    return { clonedPlatformAgent, bolnaAgentId: newBolnaId };
  }
}
