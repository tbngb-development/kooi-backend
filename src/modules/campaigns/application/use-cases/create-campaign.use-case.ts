// modules/campaigns/application/use-cases/create-campaign.use-case.ts

import type { VoiceProvider } from "@prisma/client";
import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { ITenantVoiceProviderService } from "../../../tenants/application/services/tenant-voice-provider.service";
import type {
  ISarvamCampaignClient,
  CreateSarvamCampaignPayload,
} from "../../infrastructure/clients/sarvam-campaign.client";
import type { ISarvamApiKeyEncryptionService } from "../../../sarvam-api-keys/application/interfaces/sarvam-api-key-encryption.interface";
import type { CreateCampaignInput } from "../dto/campaign.dto";
import {
  CampaignAssistantNotFoundError,
  CampaignAssistantRequiredError,
  CampaignSarvamAgentNotFoundError,
  CampaignSarvamAgentRequiredError,
  CampaignScheduleRequiredError,
  ExternalCampaignCreationFailedError,
  MissingRequiredVariablesError,
  InvalidCampaignVariableValueError,
  RetryConfigNotAllowedError,
  MaxActiveCampaignsReachedError,
} from "../../domain/errors/campaign.errors";
import { validateAndCleanVariables } from "../../domain/rules/campaign-variable.rules";
import { SarvamAgentMapper } from "../../../sarvam-agents/application/mappers/sarvam-agent.mapper";
import { validateSarvamCampaignVariables } from "../../../sarvam-agents/domain/rules/sarvam-variable.rules";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { assertTenantNotFrozen } from "../../../../shared/utils/tenant-freeze.guard";
import { env } from "../../../../shared/config/env";

export class CreateCampaignUseCase {
  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly planRepo: PlanRepository,
    private readonly voiceProviderService?: ITenantVoiceProviderService,
    private readonly sarvamCampaignClient?: ISarvamCampaignClient,
    private readonly sarvamEncryptionService?: ISarvamApiKeyEncryptionService,
    private readonly logger?: Logger,
  ) {}

  async execute(tenantId: string, input: CreateCampaignInput) {
    // ── 0. Workspace Migration Freeze Guard ─────────────────────
    await assertTenantNotFrozen(tenantId);

    // ── 0b. Snapshot active voice provider (fail-fast validation) ──
    let selectedProvider: VoiceProvider = "BOLNA";
    if (this.voiceProviderService) {
      const resolved =
        await this.voiceProviderService.resolveActiveProvider(tenantId);
      selectedProvider = resolved.provider;
    }

    // 1. Fetch active tenant plan
    const activePlan = await this.planRepo.getActivePlanForTenant(tenantId);

    // 2. Enforce active campaigns limit
    if (
      activePlan &&
      activePlan.maxActiveCampaigns !== null &&
      activePlan.maxActiveCampaigns !== undefined
    ) {
      const activeCount = await this.planRepo.countActiveCampaigns(tenantId);
      if (activeCount >= activePlan.maxActiveCampaigns) {
        this.logger?.warn("Max active campaigns reached", {
          action: "campaign.create",
          tenantId,
          activeCount,
          limit: activePlan.maxActiveCampaigns,
        });
        throw new MaxActiveCampaignsReachedError(activePlan.maxActiveCampaigns);
      }
    }

    // 3. Resolve retry config
    let finalRetryConfig = input.defaultRetryConfig;
    if (input.defaultRetryConfig) {
      const retryAllowed = activePlan?.retryAutomation ?? false;

      if (!retryAllowed && input.defaultRetryConfig.enabled) {
        throw new RetryConfigNotAllowedError();
      }

      if (!retryAllowed) {
        finalRetryConfig = undefined;
      }
    }

    // ── 4. Provider-Specific Logic ──
    if (selectedProvider === "BOLNA") {
      return this.createBolnaCampaign(
        tenantId,
        input,
        selectedProvider,
        finalRetryConfig,
      );
    } else if (selectedProvider === "SARVAM") {
      return this.createSarvamCampaign(
        tenantId,
        input,
        selectedProvider,
        finalRetryConfig,
      );
    } else {
      throw new Error(`Unsupported voice provider: ${selectedProvider}`);
    }
  }

  // ── Bolna Creation Flow (Preserved exactly as-is) ─────────────
  private async createBolnaCampaign(
    tenantId: string,
    input: CreateCampaignInput,
    selectedProvider: VoiceProvider,
    finalRetryConfig?: Record<string, unknown>,
  ) {
    if (!input.assistantId) {
      throw new CampaignAssistantRequiredError();
    }

    const assistant = await this.campaignRepo.findAssistantWithAgent(
      tenantId,
      input.assistantId,
    );
    if (!assistant) {
      throw new CampaignAssistantNotFoundError();
    }

    const requiredVariables = assistant.platformAgent.requiredVariables;
    const { cleaned, missing } = validateAndCleanVariables(
      requiredVariables,
      input.variables,
    );
    if (missing.length > 0) {
      throw new MissingRequiredVariablesError(missing);
    }

    const campaign = await this.campaignRepo.create(tenantId, {
      name: input.name,
      description: input.description,
      assistantId: input.assistantId,
      provider: selectedProvider,
      variables: cleaned,
      defaultRetryConfig: finalRetryConfig,
    });

    this.logger?.info("Bolna campaign created", {
      action: "campaign.create",
      tenantId,
      campaignId: campaign.id,
      assistantId: input.assistantId,
      provider: selectedProvider,
    });

    return campaign;
  }

  // ── Sarvam Creation Flow (External creation with failure safety) ──
  private async createSarvamCampaign(
    tenantId: string,
    input: CreateCampaignInput,
    selectedProvider: VoiceProvider,
    finalRetryConfig?: Record<string, unknown>,
  ) {
    if (!input.sarvamAgentId) {
      throw new CampaignSarvamAgentRequiredError();
    }

    const sarvamAgent = await this.campaignRepo.findSarvamAgentWithApiKey(
      tenantId,
      input.sarvamAgentId,
    );
    if (!sarvamAgent) {
      throw new CampaignSarvamAgentNotFoundError();
    }

    if (!sarvamAgent.allowedSchedule) {
      throw new CampaignScheduleRequiredError(
        "Assigned voice agent does not have a calling window configured. Please contact your administrator.",
      );
    }

    const sarvamMapper = new SarvamAgentMapper();
    const agentSchedule = sarvamMapper.parseAllowedSchedule(
      sarvamAgent.allowedSchedule,
    );
    if (!agentSchedule) {
      throw new CampaignScheduleRequiredError(
        "Assigned voice agent does not have a valid calling window configured. Please contact your administrator.",
      );
    }

    const MAX_DURATION_DAYS = 90;
    const MAX_DURATION_MS = MAX_DURATION_DAYS * 24 * 60 * 60 * 1000;

    const now = Date.now();
    const startDate = input.startTimestamp
      ? new Date(input.startTimestamp)
      : new Date(now + 3 * 60 * 1000);
    const endDate = input.endTimestamp
      ? new Date(input.endTimestamp)
      : new Date(startDate.getTime() + MAX_DURATION_MS);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new CampaignScheduleRequiredError(
        "Invalid startTimestamp or endTimestamp format",
      );
    }

    if (endDate <= startDate) {
      throw new CampaignScheduleRequiredError(
        "endTimestamp must be after startTimestamp",
      );
    }

    if (endDate.getTime() - startDate.getTime() > MAX_DURATION_MS) {
      throw new CampaignScheduleRequiredError(
        `Campaign duration cannot exceed ${MAX_DURATION_DAYS} days from start date`,
      );
    }

    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    // Authoritative backend validation of Sarvam agent variables
    const agentVariablesList = sarvamMapper.parseAgentVariables(
      sarvamAgent.agentVariables,
    );
    const tenantOverrides =
      (sarvamAgent.overrides?.[0]?.variableOverrides as Record<string, string>) ?? {};

    const { cleaned: validatedVariables, missing: missingRequired, invalidValues } =
      validateSarvamCampaignVariables(
        agentVariablesList,
        input.variables,
        tenantOverrides,
      );

    if (missingRequired.length > 0) {
      throw new MissingRequiredVariablesError(missingRequired);
    }

    if (invalidValues.length > 0) {
      throw new InvalidCampaignVariableValueError(invalidValues);
    }

    const cleanedVariables = validatedVariables;

    // Decrypt API key
    if (!this.sarvamEncryptionService) {
      throw new Error("Sarvam encryption service is not configured");
    }
    const decryptedApiKey = this.sarvamEncryptionService.decrypt(
      sarvamAgent.apiKey.apiKeyEncrypted,
    );

    // 1. Create internal Kooi Campaign first with Draft status
    const campaign = await this.campaignRepo.create(tenantId, {
      name: input.name,
      description: input.description,
      status: "DRAFT",
      provider: selectedProvider,
      sarvamAgentId: input.sarvamAgentId,
      startTimestamp: startIso,
      endTimestamp: endIso,
      allowedSchedule: agentSchedule as unknown as Record<string, unknown>,
      variables: cleanedVariables,
      goals: (sarvamAgent.goals || []).map((g) => ({
        agentGoalId: g.id,
        outputVariableName: g.outputVariableName,
        expectedValue: g.expectedValue,
        displayName: g.displayName,
      })),
      defaultRetryConfig: finalRetryConfig,
    });

    // 2. Dispatch external creation to Sarvam API
    if (!this.sarvamCampaignClient) {
      throw new Error("Sarvam campaign client is not configured");
    }

    const webhookSecret = env.sarvam.webhookSecret;
    const baseWebhookUrl = env.webhook.baseUrl
      ? `${env.webhook.baseUrl}/api/webhooks/sarvam`
      : "https://apps.kooi.io/api/webhooks/sarvam";
    const webhookUrl = webhookSecret
      ? `${baseWebhookUrl}?secret=${encodeURIComponent(webhookSecret)}`
      : baseWebhookUrl;

    const webhookConfig = {
      url: webhookUrl,
      metadata: {
        tenantId,
        campaignId: campaign.id,
        secret: webhookSecret,
      },
    };

    const sarvamPayload: CreateSarvamCampaignPayload = {
      name: input.name,
      description: input.description || null,
      start_timestamp: startIso,
      end_timestamp: endIso,
      allowed_schedule: {
        allowed_start_time: agentSchedule.allowed_start_time,
        allowed_end_time: agentSchedule.allowed_end_time,
        allowed_days: agentSchedule.allowed_days,
        timezone: agentSchedule.timezone || "Asia/Kolkata",
      },
      app_config: {
        app_id: sarvamAgent.appId,
        app_type: "agent",
        app_version: sarvamAgent.appVersion,
        attempts_per_second: sarvamAgent.attemptsPerSecond ?? 1,
        connection_configs: (
          (sarvamAgent.connectionConfigs as any[]) ?? []
        ).map((cfg) => ({
          connection_id: cfg.connection_id,
          agent_phone_number:
            cfg.agent_phone_number || cfg.phone_numbers?.[0] || "",
          phone_numbers:
            Array.isArray(cfg.phone_numbers) && cfg.phone_numbers.length > 0
              ? cfg.phone_numbers
              : cfg.agent_phone_number
                ? [cfg.agent_phone_number]
                : [],
        })),
        retry_config: (sarvamAgent.retryConfig as any) ?? { max_retries: 0 },
      },
      webhook_config: webhookConfig,
    };

    try {
      this.logger?.info("sarvam campaign payload: ", {
        orgId: sarvamAgent.apiKey.organizationId,
        workId: sarvamAgent.apiKey.workspaceId,
        apiKey: decryptedApiKey,
        campaignDetails: sarvamPayload,
      });
      const sarvamRes = await this.sarvamCampaignClient.createCampaign(
        sarvamAgent.apiKey.organizationId,
        sarvamAgent.apiKey.workspaceId,
        decryptedApiKey,
        sarvamPayload,
      );

      // Save external campaign ID
      const updatedCampaign = await this.campaignRepo.update(
        tenantId,
        campaign.id,
        {
          sarvamCampaignId: sarvamRes.campaign_id,
        },
      );

      this.logger?.info("Sarvam campaign created and linked", {
        action: "campaign.create",
        tenantId,
        campaignId: campaign.id,
        sarvamCampaignId: sarvamRes.campaign_id,
        provider: selectedProvider,
      });

      return updatedCampaign;
    } catch (err: any) {
      this.logger?.error("External Sarvam campaign creation failed", {
        action: "campaign.create",
        tenantId,
        campaignId: campaign.id,
        error: err?.message || String(err),
      });

      // Mark the Kooi campaign as FAILED and retain diagnostics
      await this.campaignRepo.updateStatus(campaign.id, "FAILED");

      throw new ExternalCampaignCreationFailedError(
        err?.message || "Provider returned an error during campaign creation",
      );
    }
  }
}
