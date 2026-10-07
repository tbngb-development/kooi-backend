import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { CreateCampaignInput } from "../dto/campaign.dto";
import {
  CampaignAssistantNotFoundError,
  MissingRequiredVariablesError,
  RetryConfigNotAllowedError,
  MaxActiveCampaignsReachedError,
} from "../../domain/errors/campaign.errors";
import { validateAndCleanVariables } from "../../domain/rules/campaign-variable.rules";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { assertTenantNotFrozen } from "../../../../shared/utils/tenant-freeze.guard";

export class CreateCampaignUseCase {
  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly planRepo: PlanRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(tenantId: string, input: CreateCampaignInput) {
    // ── 0. Workspace Migration Freeze Guard ─────────────────────
    await assertTenantNotFrozen(tenantId);

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

    // 3. Fetch assistant + platform agent
    const assistant = await this.campaignRepo.findAssistantWithAgent(
      tenantId,
      input.assistantId,
    );
    if (!assistant) {
      throw new CampaignAssistantNotFoundError();
    }

    // 4. Validate and clean variables
    const requiredVariables = assistant.platformAgent.requiredVariables;
    const { cleaned, missing } = validateAndCleanVariables(
      requiredVariables,
      input.variables,
    );
    if (missing.length > 0) {
      throw new MissingRequiredVariablesError(missing);
    }

    // 5. Resolve retry config
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

    // 6. Create campaign
    const campaign = await this.campaignRepo.create(tenantId, {
      ...input,
      variables: cleaned,
      defaultRetryConfig: finalRetryConfig,
    });

    this.logger?.info("Campaign created", {
      action: "campaign.create",
      tenantId,
      campaignId: campaign.id,
      assistantId: input.assistantId,
    });

    return campaign;
  }
}
