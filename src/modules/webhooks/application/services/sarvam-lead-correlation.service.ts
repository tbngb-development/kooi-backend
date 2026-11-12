import {
  normalizePhoneNumber,
  isValidE164,
} from "../../../leads/domain/rules/phone.rules";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type {
  CorrelateSarvamLeadInput,
  SarvamLeadCorrelationResult,
  ISarvamLeadCorrelationRepository,
} from "../interfaces/sarvam-lead-correlation.interface";

export class SarvamLeadCorrelationService {
  constructor(
    private readonly repo: ISarvamLeadCorrelationRepository,
    private readonly logger?: Logger,
  ) {}

  /**
   * Deterministically and securely correlates incoming Sarvam webhook event
   * data to an existing Kooi Campaign, LeadBatch, and Lead.
   *
   * Correlation Chain:
   * Sarvam Campaign ID -> Kooi Campaign -> Sarvam Cohort ID -> Kooi LeadBatch -> normalized user_phone_number -> Kooi Lead
   *
   * Returns a discriminated result object. Never performs an unscoped global
   * phone lookup, never selects arbitrarily on multiple matches, and never mutates state.
   */
  async correlate(
    input: CorrelateSarvamLeadInput,
  ): Promise<SarvamLeadCorrelationResult> {
    const { sarvamCampaignId, sarvamCohortId, userPhoneNumber } = input;

    // 1. Phone validation & normalization
    if (!userPhoneNumber || !userPhoneNumber.trim()) {
      return {
        success: false,
        failure: {
          code: "MISSING_PHONE_NUMBER",
          message: "User phone number is missing from the payload",
        },
      };
    }

    const normalizedPhone = normalizePhoneNumber(userPhoneNumber.trim());
    if (!isValidE164(normalizedPhone)) {
      return {
        success: false,
        failure: {
          code: "INVALID_PHONE_NUMBER",
          message: `Normalized phone number "${normalizedPhone}" is not a valid E.164 phone number`,
          details: {
            raw: userPhoneNumber,
            normalized: normalizedPhone,
          },
        },
      };
    }

    // 2. Campaign resolution
    if (!sarvamCampaignId || !sarvamCampaignId.trim()) {
      return {
        success: false,
        failure: {
          code: "UNKNOWN_CAMPAIGN",
          message: "Sarvam campaign ID is missing or empty",
        },
      };
    }

    const campaigns = await this.repo.findCampaignsBySarvamId(sarvamCampaignId.trim());

    if (campaigns.length === 0) {
      return {
        success: false,
        failure: {
          code: "UNKNOWN_CAMPAIGN",
          message: `No campaign found matching Sarvam campaign ID "${sarvamCampaignId}"`,
          details: { sarvamCampaignId },
        },
      };
    }

    const activeCampaigns = campaigns.filter((c) => !c.isDeleted);
    if (activeCampaigns.length === 0) {
      return {
        success: false,
        failure: {
          code: "CAMPAIGN_DELETED",
          message: `Campaign matching Sarvam campaign ID "${sarvamCampaignId}" has been deleted`,
          details: { sarvamCampaignId },
        },
      };
    }

    if (activeCampaigns.length > 1) {
      this.logger?.warn("Ambiguous campaign correlation detected", {
        action: "sarvam_correlation.ambiguous_campaign",
        sarvamCampaignId,
        matchCount: activeCampaigns.length,
      });
      return {
        success: false,
        failure: {
          code: "AMBIGUOUS_CAMPAIGN_MATCH",
          message: `Multiple active campaigns found matching Sarvam campaign ID "${sarvamCampaignId}"`,
          details: { sarvamCampaignId, matchCount: activeCampaigns.length },
        },
      };
    }

    const campaign = activeCampaigns[0];

    if (campaign.provider !== "SARVAM") {
      return {
        success: false,
        failure: {
          code: "INVALID_PROVIDER",
          message: `Campaign "${campaign.id}" provider is "${campaign.provider}", expected "SARVAM"`,
          details: { campaignId: campaign.id, provider: campaign.provider },
        },
      };
    }

    if (
      !campaign.sarvamAgentId ||
      !campaign.sarvamAgent ||
      campaign.sarvamAgent.status !== "ACTIVE"
    ) {
      return {
        success: false,
        failure: {
          code: "INACTIVE_PROVIDER_CONFIG",
          message: `Campaign "${campaign.id}" does not have an active Sarvam agent configuration`,
          details: {
            campaignId: campaign.id,
            sarvamAgentId: campaign.sarvamAgentId,
            agentStatus: campaign.sarvamAgent?.status,
          },
        },
      };
    }

    // 3. Cohort / Batch resolution
    if (!sarvamCohortId || !sarvamCohortId.trim()) {
      return {
        success: false,
        failure: {
          code: "UNKNOWN_COHORT",
          message: "Sarvam cohort ID is missing or empty",
        },
      };
    }

    const batches = await this.repo.findBatchesBySarvamCohortId(sarvamCohortId.trim());

    if (batches.length === 0) {
      return {
        success: false,
        failure: {
          code: "UNKNOWN_COHORT",
          message: `No batch found matching Sarvam cohort ID "${sarvamCohortId}"`,
          details: { sarvamCohortId },
        },
      };
    }

    const activeBatches = batches.filter((b) => !b.isDeleted);
    if (activeBatches.length === 0) {
      return {
        success: false,
        failure: {
          code: "BATCH_DELETED",
          message: `Batch matching Sarvam cohort ID "${sarvamCohortId}" has been deleted`,
          details: { sarvamCohortId },
        },
      };
    }

    if (activeBatches.length > 1) {
      this.logger?.warn("Ambiguous batch correlation detected", {
        action: "sarvam_correlation.ambiguous_batch",
        sarvamCohortId,
        matchCount: activeBatches.length,
      });
      return {
        success: false,
        failure: {
          code: "AMBIGUOUS_BATCH_MATCH",
          message: `Multiple active batches found matching Sarvam cohort ID "${sarvamCohortId}"`,
          details: { sarvamCohortId, matchCount: activeBatches.length },
        },
      };
    }

    const batch = activeBatches[0];

    if (batch.campaignId !== campaign.id) {
      return {
        success: false,
        failure: {
          code: "COHORT_CAMPAIGN_MISMATCH",
          message: `Batch "${batch.id}" belongs to campaign "${batch.campaignId}", but cohort was reported for campaign "${campaign.id}"`,
          details: {
            batchId: batch.id,
            batchCampaignId: batch.campaignId,
            reportedCampaignId: campaign.id,
          },
        },
      };
    }

    if (batch.tenantId !== campaign.tenantId) {
      return {
        success: false,
        failure: {
          code: "TENANT_MISMATCH",
          message: `Batch tenant "${batch.tenantId}" does not match campaign tenant "${campaign.tenantId}"`,
          details: {
            batchTenantId: batch.tenantId,
            campaignTenantId: campaign.tenantId,
          },
        },
      };
    }

    // 4. Lead resolution
    let leads = await this.repo.findLeadsByBatchAndPhone(batch.id, normalizedPhone);

    if (leads.length === 0 && typeof this.repo.findLeadsByCampaignAndPhone === "function") {
      leads = await this.repo.findLeadsByCampaignAndPhone(campaign.id, normalizedPhone);
    }

    if (leads.length === 0) {
      return {
        success: false,
        failure: {
          code: "LEAD_NOT_FOUND",
          message: `No lead found with phone "${normalizedPhone}" in batch "${batch.id}" or campaign "${campaign.id}"`,
          details: { batchId: batch.id, campaignId: campaign.id, normalizedPhone },
        },
      };
    }

    const activeLeads = leads.filter((l) => !l.isDeleted);
    if (activeLeads.length === 0) {
      return {
        success: false,
        failure: {
          code: "LEAD_DELETED",
          message: `Lead with phone "${normalizedPhone}" in batch "${batch.id}" has been deleted`,
          details: { batchId: batch.id, normalizedPhone },
        },
      };
    }

    if (activeLeads.length > 1) {
      this.logger?.warn("Ambiguous lead correlation detected", {
        action: "sarvam_correlation.ambiguous_lead",
        batchId: batch.id,
        normalizedPhone,
        matchCount: activeLeads.length,
      });
      return {
        success: false,
        failure: {
          code: "AMBIGUOUS_LEAD_MATCH",
          message: `Multiple active leads found with phone "${normalizedPhone}" in batch "${batch.id}"`,
          details: { batchId: batch.id, normalizedPhone, matchCount: activeLeads.length },
        },
      };
    }

    const lead = activeLeads[0];

    if (lead.tenantId !== campaign.tenantId) {
      return {
        success: false,
        failure: {
          code: "TENANT_MISMATCH",
          message: `Lead tenant "${lead.tenantId}" does not match campaign tenant "${campaign.tenantId}"`,
          details: {
            leadTenantId: lead.tenantId,
            campaignTenantId: campaign.tenantId,
          },
        },
      };
    }

    // 5. Success
    return {
      success: true,
      data: {
        tenantId: campaign.tenantId,
        campaign: {
          id: campaign.id,
          name: campaign.name,
          provider: campaign.provider ?? "SARVAM",
          sarvamCampaignId: campaign.sarvamCampaignId ?? sarvamCampaignId,
          sarvamAgentId: campaign.sarvamAgentId,
          status: campaign.status,
        },
        batch: {
          id: batch.id,
          name: batch.name,
          provider: batch.provider ?? "SARVAM",
          sarvamCohortId: batch.sarvamCohortId ?? sarvamCohortId,
          status: batch.status,
        },
        lead: {
          id: lead.id,
          phone: lead.phone,
          name: lead.name,
          status: lead.status,
          metadata: (lead.metadata as Record<string, unknown> | null) ?? null,
        },
        normalizedPhone,
      },
    };
  }
}

