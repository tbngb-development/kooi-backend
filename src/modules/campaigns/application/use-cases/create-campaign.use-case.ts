import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { CreateCampaignInput } from "../dto/campaign.dto";
import {
  CampaignAssistantNotFoundError,
  BrochureNotConfirmedError,
  MissingRequiredVariablesError,
  RetryConfigNotAllowedError,
} from "../../domain/errors/campaign.errors";
import { validateAndCleanVariables } from "../../domain/rules/campaign-variable.rules";

export class CreateCampaignUseCase {
  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly planRepo: PlanRepository,
  ) {}

  async execute(tenantId: string, input: CreateCampaignInput) {
    // 1. Fetch assistant + platform agent
    const assistant = await this.campaignRepo.findAssistantWithAgent(
      tenantId,
      input.assistantId,
    );
    if (!assistant) {
      throw new CampaignAssistantNotFoundError();
    }

    // 2. Validate and clean variables using domain rule
    const { cleaned, missing } = validateAndCleanVariables(
      assistant.platformAgent.requiredVariables,
      input.variables,
    );
    if (missing.length > 0) {
      throw new MissingRequiredVariablesError(missing);
    }

    // 3. Resolve retry config — only act if user explicitly provided one
    let finalRetryConfig = input.defaultRetryConfig;

    if (input.defaultRetryConfig) {
      const tenantPlan = await this.planRepo.getTenantPlan(tenantId);
      const retryAllowed = tenantPlan?.planVersion?.retryAutomation ?? false;

      if (!retryAllowed && input.defaultRetryConfig.enabled) {
        throw new RetryConfigNotAllowedError();
      }

      // Plan doesn't allow retry — strip the config entirely
      if (!retryAllowed) {
        finalRetryConfig = undefined;
      }
    }

    // 4. Brochure confirmation check (unchanged)
    if (input.brochureId) {
      const confirmed = await this.campaignRepo.checkBrochureConfirmed(
        tenantId,
        input.brochureId,
      );
      if (!confirmed) {
        throw new BrochureNotConfirmedError();
      }
    }

    // 5. Create campaign
    return this.campaignRepo.create(tenantId, {
      ...input,
      variables: cleaned,
      defaultRetryConfig: finalRetryConfig,
    });
  }
}