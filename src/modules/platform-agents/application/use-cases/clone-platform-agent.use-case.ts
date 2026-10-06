import type { CloneAgentToWorkspaceUseCase } from "./clone-agent-to-workspace.use-case";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type { PlatformAgent } from "@prisma/client";

export interface ClonePlatformAgentInput {
  sourcePlatformAgentId: string;
  targetApiKeyId: string;
  newName?: string;
}

export class ClonePlatformAgentUseCase {
  constructor(
    private readonly cloneAgentUseCase: CloneAgentToWorkspaceUseCase,
    private readonly logger?: Logger,
  ) {}

  async execute(input: ClonePlatformAgentInput): Promise<PlatformAgent> {
    const { clonedPlatformAgent, bolnaAgentId } =
      await this.cloneAgentUseCase.execute({
        sourcePlatformAgentId: input.sourcePlatformAgentId,
        targetApiKeyId: input.targetApiKeyId,
        tenantName: input.newName,
      });

    this.logger?.info("PlatformAgent cloned successfully", {
      action: "platform_agent.cloned",
      sourcePlatformAgentId: input.sourcePlatformAgentId,
      clonedPlatformAgentId: clonedPlatformAgent.id,
      bolnaAgentId,
    });

    return clonedPlatformAgent;
  }
}
