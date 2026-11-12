// modules/campaigns/application/use-cases/update-campaign.use-case.ts

import type {
  CampaignRepository,
  UpdateCampaignData,
  AssistantWithAgentData,
} from "../interfaces/campaign-repository.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type { ISarvamCampaignClient } from "../../infrastructure/clients/sarvam-campaign.client";
import type { ISarvamApiKeyEncryptionService } from "../../../sarvam-api-keys/application/interfaces/sarvam-api-key-encryption.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import {
  CampaignNotFoundError,
  CampaignAlreadyDeletedError,
  CampaignAssistantNotFoundError,
  MissingRequiredVariablesError,
  CampaignRetryConfigImmutableAfterStartError,
  RetryConfigNotAllowedError,
} from "../../domain/errors/campaign.errors";
import { PlatformAgentNotFoundError } from "../../../platform-agents/domain/errors/platform-agent.errors";
import { validateAndCleanVariables } from "../../domain/rules/campaign-variable.rules";
import { resolveSarvamCampaignRetry } from "../../../sarvam-agents/domain/rules/sarvam-retry-config.rules";
import type { CampaignEntityData } from "../../domain/entities/campaign.entity";

export interface UpdateCampaignParams {
  tenantId?: string;
  campaignId: string;
  name?: string;
  description?: string | null;
  platformAgentId?: string;
  assistantId?: string;
  variables?: Record<string, string>;
  defaultRetryConfig?: Record<string, unknown> | null;
}

export class UpdateCampaignUseCase {
  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly logger?: Logger,
    private readonly sarvamCampaignClient?: ISarvamCampaignClient,
    private readonly sarvamEncryptionService?: ISarvamApiKeyEncryptionService,
    private readonly planRepo?: PlanRepository,
  ) {}

  async execute(input: UpdateCampaignParams): Promise<CampaignEntityData> {
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

    // 2. Resolve assistant / platform agent if provided
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

    // 3. Validate and clean variables if variables provided or agent changed
    let cleanedVariables: Record<string, string> | undefined = undefined;

    if (input.variables !== undefined || isAgentChanged) {
      if (!targetAssistant && targetAssistantId) {
        targetAssistant = await this.campaignRepo.findAssistantWithAgent(
          tenantId,
          targetAssistantId,
        );
      }

      if (targetAssistant) {
        const requiredVariables = targetAssistant.platformAgent.requiredVariables;
        const currentVariables =
          (campaign.variables as Record<string, string> | null) ?? {};

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

    // 4. Handle defaultRetryConfig updates & provider synchronization
    let resolvedDefaultRetryConfig = input.defaultRetryConfig;

    if (input.defaultRetryConfig !== undefined) {
      if (campaign.provider === "SARVAM") {
        if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
          throw new CampaignRetryConfigImmutableAfterStartError(campaign.status);
        }

        const activePlan = this.planRepo
          ? await this.planRepo.getActivePlanForTenant(tenantId)
          : null;
        const retryAllowed = activePlan ? activePlan.retryAutomation : true;

        if (input.defaultRetryConfig && (input.defaultRetryConfig as any).enabled && !retryAllowed) {
          throw new RetryConfigNotAllowedError();
        }

        const resolved = resolveSarvamCampaignRetry(
          (campaign.defaultRetryConfig as any) ?? { max_retries: 0 },
          (input.defaultRetryConfig as any) ?? undefined,
          retryAllowed,
        );

        if (
          campaign.sarvamCampaignId &&
          this.sarvamCampaignClient &&
          this.sarvamEncryptionService &&
          campaign.sarvamAgentId
        ) {
          const sarvamAgent = await this.campaignRepo.findSarvamAgentWithApiKey(
            tenantId,
            campaign.sarvamAgentId,
          );

          if (sarvamAgent) {
            const decryptedApiKey = this.sarvamEncryptionService.decrypt(
              sarvamAgent.apiKey.apiKeyEncrypted,
            );

            await this.sarvamCampaignClient.updateCampaign(
              sarvamAgent.apiKey.organizationId,
              sarvamAgent.apiKey.workspaceId,
              campaign.sarvamCampaignId,
              decryptedApiKey,
              {
                app_config: {
                  retry_config: resolved.providerConfig,
                } as any,
              },
            );
          }
        }

        resolvedDefaultRetryConfig = resolved.persistedConfig as unknown as Record<string, unknown>;
      } else if (campaign.provider === "BOLNA" && input.defaultRetryConfig) {
        const activePlan = this.planRepo
          ? await this.planRepo.getActivePlanForTenant(tenantId)
          : null;
        const retryAllowed = activePlan ? activePlan.retryAutomation : true;

        if ((input.defaultRetryConfig as any).enabled && !retryAllowed) {
          throw new RetryConfigNotAllowedError();
        }
      }
    }

    // 5. Construct update payload
    const updateData: UpdateCampaignData = {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.description !== undefined && { description: input.description }),
      ...(isAgentChanged && { assistantId: targetAssistantId }),
      ...(cleanedVariables !== undefined && { variables: cleanedVariables }),
      ...(input.defaultRetryConfig !== undefined && {
        defaultRetryConfig: resolvedDefaultRetryConfig,
      }),
    };

    const updated = await this.campaignRepo.update(
      tenantId,
      campaignId,
      updateData,
    );

    this.logger?.info("Campaign updated by Platform Admin", {
      action: "campaign.admin_update",
      tenantId,
      campaignId,
      status: campaign.status,
      isAgentChanged,
      updatedFields: Object.keys(updateData),
    });

    return updated;
  }
}

// Backward-compatibility aliases
export { UpdateCampaignUseCase as UpdateDraftCampaignUseCase };
export type { UpdateCampaignParams as UpdateDraftCampaignParams };
