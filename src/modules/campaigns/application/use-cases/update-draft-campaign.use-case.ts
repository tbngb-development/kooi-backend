// modules/campaigns/application/use-cases/update-draft-campaign.use-case.ts

import type { CampaignRepository, UpdateCampaignData, AssistantWithAgentData } from "../interfaces/campaign-repository.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";
import {
  CampaignNotFoundError,
  CampaignAlreadyDeletedError,
  CampaignNotDraftError,
  CampaignAssistantNotFoundError,
  MissingRequiredVariablesError,
} from "../../domain/errors/campaign.errors";
import { PlatformAgentNotFoundError } from "../../../platform-agents/domain/errors/platform-agent.errors";
import { validateAndCleanVariables } from "../../domain/rules/campaign-variable.rules";
import type { CampaignEntityData } from "../../domain/entities/campaign.entity";

export interface UpdateDraftCampaignParams {
  tenantId?: string;
  campaignId: string;
  name?: string;
  description?: string | null;
  platformAgentId?: string;
  assistantId?: string;
  variables?: Record<string, string>;
  defaultRetryConfig?: Record<string, unknown> | null;
}

export class UpdateDraftCampaignUseCase {
  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(input: UpdateDraftCampaignParams): Promise<CampaignEntityData> {
    const { campaignId } = input;

    // 1. Fetch campaign and verify existence
    const campaign = input.tenantId
      ? await this.campaignRepo.findById(input.tenantId, campaignId)
      : await this.campaignRepo.findByIdGlobal(campaignId);

    if (!campaign) {
      throw new CampaignNotFoundError();
    }

    const tenantId = campaign.tenantId;

    if (campaign.isDeleted) {
      throw new CampaignAlreadyDeletedError();
    }

    // 2. Enforce DRAFT status constraint
    if (campaign.status !== "DRAFT") {
      throw new CampaignNotDraftError(campaign.status);
    }

    // 3. Resolve assistant / platform agent if provided
    let targetAssistantId = campaign.assistantId;
    let isAgentChanged = false;
    let targetAssistant: AssistantWithAgentData | null = null;

    if (input.assistantId && input.assistantId !== campaign.assistantId) {
      targetAssistant = await this.campaignRepo.findAssistantWithAgent(
        tenantId,
        input.assistantId,
      );
      if (!targetAssistant) {
        throw new CampaignAssistantNotFoundError();
      }
      targetAssistantId = targetAssistant.id;
      isAgentChanged = true;
    } else if (input.platformAgentId) {
      targetAssistant = await this.campaignRepo.resolveAssistantForPlatformAgent(
        tenantId,
        input.platformAgentId,
      );
      if (!targetAssistant) {
        throw new PlatformAgentNotFoundError(input.platformAgentId);
      }
      if (targetAssistant.id !== campaign.assistantId) {
        targetAssistantId = targetAssistant.id;
        isAgentChanged = true;
      }
    }

    // 4. Validate and clean variables if variables provided or agent changed
    let cleanedVariables: Record<string, string> | undefined = undefined;

    if (input.variables !== undefined || isAgentChanged) {
      if (!targetAssistant) {
        targetAssistant = await this.campaignRepo.findAssistantWithAgent(
          tenantId,
          targetAssistantId,
        );
      }

      if (targetAssistant) {
        const requiredVariables = targetAssistant.platformAgent.requiredVariables;
        const currentVariables = (campaign.variables as Record<string, string> | null) ?? {};

        const variablesToValidate =
          input.variables !== undefined
            ? isAgentChanged
              ? input.variables
              : { ...currentVariables, ...input.variables }
            : currentVariables;

        const { cleaned, missing } = validateAndCleanVariables(
          requiredVariables,
          variablesToValidate,
        );

        if (missing.length > 0) {
          throw new MissingRequiredVariablesError(missing);
        }

        cleanedVariables = cleaned;
      }
    }

    // 5. Construct update payload
    const updateData: UpdateCampaignData = {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.description !== undefined && { description: input.description }),
      ...(isAgentChanged && { assistantId: targetAssistantId }),
      ...(cleanedVariables !== undefined && { variables: cleanedVariables }),
      ...(input.defaultRetryConfig !== undefined && {
        defaultRetryConfig: input.defaultRetryConfig,
      }),
    };

    const updated = await this.campaignRepo.update(
      tenantId,
      campaignId,
      updateData,
    );

    this.logger?.info("Draft campaign updated by Platform Admin", {
      action: "campaign.draft.admin_update",
      tenantId,
      campaignId,
      isAgentChanged,
      updatedFields: Object.keys(updateData),
    });

    return updated;
  }
}
