import { describe, it, expect, vi, beforeEach } from "vitest";
import { SarvamLeadCorrelationService } from "../application/services/sarvam-lead-correlation.service";
import type {
  ISarvamLeadCorrelationRepository,
  CampaignCorrelationCandidate,
  BatchCorrelationCandidate,
  LeadCorrelationCandidate,
} from "../application/interfaces/sarvam-lead-correlation.interface";
import type { Logger } from "../../../shared/logging/logger.interface";

describe("SarvamLeadCorrelationService", () => {
  let service: SarvamLeadCorrelationService;
  let mockRepo: ISarvamLeadCorrelationRepository;
  let mockLogger: Logger;

  const tenantId = "tenant-sarvam-corp";
  const campaignId = "camp-kooi-101";
  const batchId = "batch-kooi-202";
  const leadId = "lead-kooi-303";
  const sarvamCampaignId = "sarvam-camp-ext-1";
  const sarvamCohortId = "sarvam-cohort-ext-2";
  const sarvamAgentId = "agent-sarvam-01";
  const validRawPhone = "+919876543210";
  const normalizedPhone = "+919876543210";

  const defaultCampaignCandidate: CampaignCorrelationCandidate = {
    id: campaignId,
    name: "Sarvam Support Campaign",
    tenantId,
    provider: "SARVAM",
    sarvamCampaignId,
    sarvamAgentId,
    status: "RUNNING",
    isDeleted: false,
    sarvamAgent: {
      id: sarvamAgentId,
      status: "ACTIVE",
    },
  };

  const defaultBatchCandidate: BatchCorrelationCandidate = {
    id: batchId,
    name: "Initial Batch",
    tenantId,
    campaignId,
    provider: "SARVAM",
    sarvamCohortId,
    status: "RUNNING",
    isDeleted: false,
  };

  const defaultLeadCandidate: LeadCorrelationCandidate = {
    id: leadId,
    phone: normalizedPhone,
    name: "Arjun Mehta",
    status: "CALLING",
    tenantId,
    campaignId,
    batchId,
    metadata: { account_id: "ACC-99" },
    isDeleted: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      findCampaignsBySarvamId: vi.fn().mockResolvedValue([defaultCampaignCandidate]),
      findBatchesBySarvamCohortId: vi.fn().mockResolvedValue([defaultBatchCandidate]),
      findLeadsByBatchAndPhone: vi.fn().mockResolvedValue([defaultLeadCandidate]),
      findLeadsByCampaignAndPhone: vi.fn().mockResolvedValue([]),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    service = new SarvamLeadCorrelationService(mockRepo, mockLogger);
  });

  describe("1. Happy Path", () => {
    it("successfully correlates a Sarvam event to verified Campaign, Batch, and Lead", async () => {
      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: validRawPhone,
        userIdentifier: "user-ref-123",
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.tenantId).toBe(tenantId);
      expect(result.data.normalizedPhone).toBe(normalizedPhone);

      expect(result.data.campaign).toEqual({
        id: campaignId,
        name: "Sarvam Support Campaign",
        provider: "SARVAM",
        sarvamCampaignId,
        sarvamAgentId,
        status: "RUNNING",
      });

      expect(result.data.batch).toEqual({
        id: batchId,
        name: "Initial Batch",
        provider: "SARVAM",
        sarvamCohortId,
        status: "RUNNING",
      });

      expect(result.data.lead).toEqual({
        id: leadId,
        phone: normalizedPhone,
        name: "Arjun Mehta",
        status: "CALLING",
        metadata: { account_id: "ACC-99" },
      });

      // Verify repo was queried with strictly scoped parameters
      expect(mockRepo.findCampaignsBySarvamId).toHaveBeenCalledWith(sarvamCampaignId);
      expect(mockRepo.findBatchesBySarvamCohortId).toHaveBeenCalledWith(sarvamCohortId);
      expect(mockRepo.findLeadsByBatchAndPhone).toHaveBeenCalledWith(batchId, normalizedPhone);
    });

    it("ignores userIdentifier during Lead lookup (only uses phone within batch)", async () => {
      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: validRawPhone,
        userIdentifier: "completely-different-arbitrary-id",
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.lead.id).toBe(leadId);
    });
  });

  describe("2. Phone Normalization", () => {
    it("normalizes a 10-digit Indian phone number to E.164 (+91...)", async () => {
      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: "9876543210",
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.normalizedPhone).toBe("+919876543210");
      expect(mockRepo.findLeadsByBatchAndPhone).toHaveBeenCalledWith(batchId, "+919876543210");
    });

    it("normalizes a domestic phone with trunk 0 prefix (09876543210)", async () => {
      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: "09876543210",
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.normalizedPhone).toBe("+919876543210");
    });

    it("normalizes spaced and hyphenated phone numbers (+91 98765-43210)", async () => {
      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: "+91 98765-43210",
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.normalizedPhone).toBe("+919876543210");
    });
  });

  describe("3. Phone Validation Failures", () => {
    it("fails with MISSING_PHONE_NUMBER when phone is empty or whitespace", async () => {
      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: "   ",
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("MISSING_PHONE_NUMBER");
    });

    it("fails with INVALID_PHONE_NUMBER when phone contains invalid characters", async () => {
      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: "invalid-number",
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("INVALID_PHONE_NUMBER");
    });

    it("fails with INVALID_PHONE_NUMBER when phone number is too short", async () => {
      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: "12345",
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("INVALID_PHONE_NUMBER");
    });
  });

  describe("4. Campaign Resolution Failures", () => {
    it("fails with UNKNOWN_CAMPAIGN when Sarvam Campaign ID is empty", async () => {
      const result = await service.correlate({
        sarvamCampaignId: "",
        sarvamCohortId,
        userPhoneNumber: validRawPhone,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("UNKNOWN_CAMPAIGN");
    });

    it("fails with UNKNOWN_CAMPAIGN when campaign does not exist in Kooi", async () => {
      vi.mocked(mockRepo.findCampaignsBySarvamId).mockResolvedValueOnce([]);

      const result = await service.correlate({
        sarvamCampaignId: "non-existent-campaign",
        sarvamCohortId,
        userPhoneNumber: validRawPhone,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("UNKNOWN_CAMPAIGN");
    });

    it("fails with CAMPAIGN_DELETED when all matching campaigns are soft-deleted", async () => {
      vi.mocked(mockRepo.findCampaignsBySarvamId).mockResolvedValueOnce([
        { ...defaultCampaignCandidate, isDeleted: true },
      ]);

      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: validRawPhone,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("CAMPAIGN_DELETED");
    });

    it("fails with AMBIGUOUS_CAMPAIGN_MATCH when multiple active campaigns share the same Sarvam ID", async () => {
      vi.mocked(mockRepo.findCampaignsBySarvamId).mockResolvedValueOnce([
        defaultCampaignCandidate,
        { ...defaultCampaignCandidate, id: "camp-kooi-duplicate" },
      ]);

      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: validRawPhone,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("AMBIGUOUS_CAMPAIGN_MATCH");
    });

    it("fails with INVALID_PROVIDER when campaign provider is BOLNA", async () => {
      vi.mocked(mockRepo.findCampaignsBySarvamId).mockResolvedValueOnce([
        { ...defaultCampaignCandidate, provider: "BOLNA" },
      ]);

      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: validRawPhone,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("INVALID_PROVIDER");
    });

    it("fails with INACTIVE_PROVIDER_CONFIG when sarvamAgentId is missing", async () => {
      vi.mocked(mockRepo.findCampaignsBySarvamId).mockResolvedValueOnce([
        { ...defaultCampaignCandidate, sarvamAgentId: null, sarvamAgent: null },
      ]);

      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: validRawPhone,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("INACTIVE_PROVIDER_CONFIG");
    });

    it("fails with INACTIVE_PROVIDER_CONFIG when linked Sarvam agent status is not ACTIVE", async () => {
      vi.mocked(mockRepo.findCampaignsBySarvamId).mockResolvedValueOnce([
        {
          ...defaultCampaignCandidate,
          sarvamAgent: { id: sarvamAgentId, status: "INACTIVE" },
        },
      ]);

      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: validRawPhone,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("INACTIVE_PROVIDER_CONFIG");
    });
  });

  describe("5. Cohort / Batch Resolution Failures", () => {
    it("fails with UNKNOWN_COHORT when Sarvam Cohort ID is empty", async () => {
      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId: "",
        userPhoneNumber: validRawPhone,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("UNKNOWN_COHORT");
    });

    it("fails with UNKNOWN_COHORT when cohort ID is not found in Kooi batches", async () => {
      vi.mocked(mockRepo.findBatchesBySarvamCohortId).mockResolvedValueOnce([]);

      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId: "unknown-cohort",
        userPhoneNumber: validRawPhone,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("UNKNOWN_COHORT");
    });

    it("fails with BATCH_DELETED when all matching batches are soft-deleted", async () => {
      vi.mocked(mockRepo.findBatchesBySarvamCohortId).mockResolvedValueOnce([
        { ...defaultBatchCandidate, isDeleted: true },
      ]);

      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: validRawPhone,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("BATCH_DELETED");
    });

    it("fails with AMBIGUOUS_BATCH_MATCH when multiple active batches have the same Sarvam Cohort ID", async () => {
      vi.mocked(mockRepo.findBatchesBySarvamCohortId).mockResolvedValueOnce([
        defaultBatchCandidate,
        { ...defaultBatchCandidate, id: "batch-kooi-duplicate" },
      ]);

      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: validRawPhone,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("AMBIGUOUS_BATCH_MATCH");
    });

    it("fails with COHORT_CAMPAIGN_MISMATCH when batch belongs to another campaign", async () => {
      vi.mocked(mockRepo.findBatchesBySarvamCohortId).mockResolvedValueOnce([
        { ...defaultBatchCandidate, campaignId: "other-campaign-id" },
      ]);

      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: validRawPhone,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("COHORT_CAMPAIGN_MISMATCH");
    });

    it("fails with TENANT_MISMATCH when batch tenant differs from campaign tenant", async () => {
      vi.mocked(mockRepo.findBatchesBySarvamCohortId).mockResolvedValueOnce([
        { ...defaultBatchCandidate, tenantId: "foreign-tenant-id" },
      ]);

      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: validRawPhone,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("TENANT_MISMATCH");
    });
  });

  describe("6. Lead Resolution Failures", () => {
    it("falls back to finding lead by campaignId when batchId lookup returns no leads", async () => {
      vi.mocked(mockRepo.findLeadsByBatchAndPhone).mockResolvedValueOnce([]);
      vi.mocked(mockRepo.findLeadsByCampaignAndPhone).mockResolvedValueOnce([
        defaultLeadCandidate,
      ]);

      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: validRawPhone,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.lead.id).toBe(defaultLeadCandidate.id);
      expect(mockRepo.findLeadsByCampaignAndPhone).toHaveBeenCalledWith(
        campaignId,
        normalizedPhone,
      );
    });

    it("fails with LEAD_NOT_FOUND when phone does not match any lead in the batch or campaign", async () => {
      vi.mocked(mockRepo.findLeadsByBatchAndPhone).mockResolvedValueOnce([]);
      vi.mocked(mockRepo.findLeadsByCampaignAndPhone).mockResolvedValueOnce([]);

      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: validRawPhone,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("LEAD_NOT_FOUND");
    });

    it("fails with LEAD_DELETED when matching lead in batch is soft-deleted", async () => {
      vi.mocked(mockRepo.findLeadsByBatchAndPhone).mockResolvedValueOnce([
        { ...defaultLeadCandidate, isDeleted: true },
      ]);

      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: validRawPhone,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("LEAD_DELETED");
    });

    it("fails with AMBIGUOUS_LEAD_MATCH when multiple active leads share the same phone in the batch", async () => {
      vi.mocked(mockRepo.findLeadsByBatchAndPhone).mockResolvedValueOnce([
        defaultLeadCandidate,
        { ...defaultLeadCandidate, id: "lead-duplicate-999" },
      ]);

      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: validRawPhone,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("AMBIGUOUS_LEAD_MATCH");
    });

    it("fails with TENANT_MISMATCH when lead tenant differs from campaign tenant", async () => {
      vi.mocked(mockRepo.findLeadsByBatchAndPhone).mockResolvedValueOnce([
        { ...defaultLeadCandidate, tenantId: "rogue-tenant-id" },
      ]);

      const result = await service.correlate({
        sarvamCampaignId,
        sarvamCohortId,
        userPhoneNumber: validRawPhone,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failure.code).toBe("TENANT_MISMATCH");
    });
  });
});
