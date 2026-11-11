// modules/campaigns/application/use-cases/create-campaign.use-case.ts

import { randomUUID } from "node:crypto";
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
import { resolveSarvamCampaignRetry } from "../../../sarvam-agents/domain/rules/sarvam-retry-config.rules";
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
    const retryAllowed = activePlan?.retryAutomation ?? false;
    let finalBolnaRetryConfig = input.defaultRetryConfig;

    if (input.defaultRetryConfig) {
      if (!retryAllowed && (input.defaultRetryConfig as any).enabled) {
        throw new RetryConfigNotAllowedError();
      }

      if (!retryAllowed) {
        finalBolnaRetryConfig = undefined;
      }
    }

    // ── 4. Provider-Specific Logic ──
    if (selectedProvider === "BOLNA") {
      return this.createBolnaCampaign(
        tenantId,
        input,
        selectedProvider,
        finalBolnaRetryConfig,
      );
    } else if (selectedProvider === "SARVAM") {
      return this.createSarvamCampaign(
        tenantId,
        input,
        selectedProvider,
        retryAllowed,
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
    planAllowsRetry: boolean,
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
      (sarvamAgent.overrides?.[0]?.variableOverrides as Record<
        string,
        string
      >) ?? {};

    const {
      cleaned: validatedVariables,
      missing: missingRequired,
      invalidValues,
    } = validateSarvamCampaignVariables(
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

    // Resolve Sarvam retry configuration (agent inheritance, tenant override, and plan enforcement)
    const agentRetryConfig = sarvamMapper.parseRetryConfig(
      sarvamAgent.retryConfig,
    );
    const { persistedConfig, providerConfig } = resolveSarvamCampaignRetry(
      agentRetryConfig,
      input.defaultRetryConfig as any,
      planAllowsRetry,
    );

    // Decrypt API key
    if (!this.sarvamEncryptionService) {
      throw new Error("Sarvam encryption service is not configured");
    }
    const decryptedApiKey = this.sarvamEncryptionService.decrypt(
      sarvamAgent.apiKey.apiKeyEncrypted,
    );

    if (!this.sarvamCampaignClient) {
      throw new Error("Sarvam campaign client is not configured");
    }

    // 1. Allocate deterministic local campaign UUID for metadata linking
    const localCampaignId = randomUUID();

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
        campaignId: localCampaignId,
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
        retry_config: providerConfig,
        webhook_config: webhookConfig,
      },
    };

    // 2. Dispatch external creation to Sarvam API FIRST
    let sarvamRes;
    try {
      this.logger?.info("Creating external Sarvam campaign", {
        action: "campaign.sarvam.create_request",
        tenantId,
        localCampaignId,
        orgId: sarvamAgent.apiKey.organizationId,
        workspaceId: sarvamAgent.apiKey.workspaceId,
      });

      sarvamRes = await this.sarvamCampaignClient.createCampaign(
        sarvamAgent.apiKey.organizationId,
        sarvamAgent.apiKey.workspaceId,
        decryptedApiKey,
        sarvamPayload,
      );
    } catch (err: any) {
      this.logger?.error("External Sarvam campaign creation failed", {
        action: "campaign.create.provider_error",
        tenantId,
        localCampaignId,
        error: err?.message || String(err),
        statusCode: err?.statusCode,
        details: err?.details,
      });

      // Provider creation failed: do NOT create local campaign
      throw new ExternalCampaignCreationFailedError();
    }

    // 3. Persist local KOOI campaign with DRAFT status only after provider success
    try {
      const campaign = await this.campaignRepo.create(tenantId, {
        id: localCampaignId,
        name: input.name,
        description: input.description,
        status: "DRAFT",
        provider: selectedProvider,
        sarvamAgentId: input.sarvamAgentId,
        sarvamCampaignId: sarvamRes.campaign_id,
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
        defaultRetryConfig: persistedConfig as unknown as Record<string, unknown>,
      });

      this.logger?.info("Sarvam campaign created and linked successfully", {
        action: "campaign.create.success",
        tenantId,
        campaignId: campaign.id,
        sarvamCampaignId: sarvamRes.campaign_id,
        provider: selectedProvider,
        status: campaign.status,
      });

      return campaign;
    } catch (dbErr: any) {
      this.logger?.error(
        "Local campaign persistence failed after external Sarvam campaign creation succeeded",
        {
          action: "campaign.create.db_persistence_failed",
          tenantId,
          localCampaignId,
          sarvamCampaignId: sarvamRes.campaign_id,
          error: dbErr?.message || String(dbErr),
        },
      );

      // Compensate: attempt to cancel the newly created external campaign to prevent orphaned execution
      try {
        await this.sarvamCampaignClient.updateStatus(
          sarvamAgent.apiKey.organizationId,
          sarvamAgent.apiKey.workspaceId,
          sarvamRes.campaign_id,
          decryptedApiKey,
          "cancel",
        );
        this.logger?.warn(
          "Orphaned Sarvam campaign cancelled via compensation after local DB failure",
          {
            action: "campaign.create.compensation_cancelled",
            tenantId,
            localCampaignId,
            sarvamCampaignId: sarvamRes.campaign_id,
          },
        );
      } catch (cancelErr: any) {
        this.logger?.error(
          "Failed to cancel orphaned Sarvam campaign during compensation",
          {
            action: "campaign.create.compensation_failed",
            tenantId,
            localCampaignId,
            sarvamCampaignId: sarvamRes.campaign_id,
            error: cancelErr?.message || String(cancelErr),
          },
        );
      }

      throw new ExternalCampaignCreationFailedError();
    }
  }
}
