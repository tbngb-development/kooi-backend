import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveCallAgent, PrismaCallRepository } from "../infrastructure/repositories/prisma-call.repository";
import prisma from "../../../shared/config/database/prisma";
import type { VoiceProvider } from "@prisma/client";

vi.mock("../../../shared/config/database/prisma", () => ({
  default: {
    call: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

describe("Provider-Aware Call Listing - Agent Resolution & Repository", () => {
  const tenantId = "tenant-test-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveCallAgent unit tests", () => {
    it("resolves Bolna Assistant for a BOLNA call", () => {
      const call = {
        provider: "BOLNA" as VoiceProvider,
        assistant: { id: "asst-1", name: "Support Assistant" },
        sarvamAgent: null,
      };

      const result = resolveCallAgent(call);
      expect(result).toEqual({ id: "asst-1", name: "Support Assistant" });
    });

    it("resolves Sarvam Agent for a SARVAM call", () => {
      const call = {
        provider: "SARVAM" as VoiceProvider,
        assistant: null,
        sarvamAgent: { id: "sarvam-1", name: "Outreach Agent" },
      };

      const result = resolveCallAgent(call);
      expect(result).toEqual({ id: "sarvam-1", name: "Outreach Agent" });
    });

    it("falls back to campaign.assistant for BOLNA call when call.assistant is null", () => {
      const call = {
        provider: "BOLNA" as VoiceProvider,
        assistant: null,
        sarvamAgent: null,
        campaign: {
          assistant: { id: "camp-asst-1", name: "Campaign Bolna Assistant" },
          sarvamAgent: null,
        },
      };

      const result = resolveCallAgent(call);
      expect(result).toEqual({ id: "camp-asst-1", name: "Campaign Bolna Assistant" });
    });

    it("falls back to campaign.sarvamAgent for SARVAM call when call.sarvamAgent is null", () => {
      const call = {
        provider: "SARVAM" as VoiceProvider,
        assistant: null,
        sarvamAgent: null,
        campaign: {
          assistant: null,
          sarvamAgent: { id: "camp-sarvam-1", name: "Campaign Sarvam Agent" },
        },
      };

      const result = resolveCallAgent(call);
      expect(result).toEqual({ id: "camp-sarvam-1", name: "Campaign Sarvam Agent" });
    });

    it("returns null gracefully if both direct agent and campaign agent are missing or deleted", () => {
      const call = {
        provider: "SARVAM" as VoiceProvider,
        assistant: null,
        sarvamAgent: null,
        campaign: null,
      };

      const result = resolveCallAgent(call);
      expect(result).toBeNull();
    });

    it("resolves historical BOLNA call using assistant even if Sarvam fields exist or provider defaulted", () => {
      // Historical call created under BOLNA
      const call = {
        provider: null, // defaults to BOLNA
        assistant: { id: "asst-legacy", name: "Legacy Assistant" },
        sarvamAgent: null,
      };

      const result = resolveCallAgent(call);
      expect(result).toEqual({ id: "asst-legacy", name: "Legacy Assistant" });
    });

    it("never crosses provider boundaries (does not pick Bolna assistant for SARVAM call)", () => {
      const call = {
        provider: "SARVAM" as VoiceProvider,
        assistant: { id: "asst-bolna", name: "Wrong Assistant" },
        sarvamAgent: null,
      };

      // Since provider is SARVAM, it should not return the Bolna assistant
      const result = resolveCallAgent(call);
      expect(result).toBeNull();
    });
  });

  describe("PrismaCallRepository.list with provider-aware agent mapping & agentId filter", () => {
    let repo: PrismaCallRepository;

    beforeEach(() => {
      repo = new PrismaCallRepository();
      // Stub getTenantCallOverview
      repo.getTenantCallOverview = vi.fn().mockResolvedValue({
        totalCalls: 2,
        completedCalls: 2,
        failedCalls: 0,
        scheduledCalls: 0,
        busyCalls: 0,
        noAnswerCalls: 0,
        avgDurationSec: 40,
        totalCostPaisa: 200,
      });
    });

    it("maps both BOLNA and SARVAM calls to unified agent property", async () => {
      const mockCallsFromDb = [
        {
          id: "call-1",
          provider: "BOLNA",
          bolnaCallId: "b-1",
          tenantId,
          campaignId: null,
          assistantId: "asst-1",
          sarvamAgentId: null,
          leadId: "lead-1",
          batchId: null,
          status: "COMPLETED",
          duration: 30,
          lead: { id: "lead-1", name: "Alice", phone: "+911111111111" },
          campaign: null,
          assistant: { id: "asst-1", name: "Bolna Agent" },
          sarvamAgent: null,
          extractionOverview: [],
          extractionInsights: [],
          _count: { goalResults: 0 },
        },
        {
          id: "call-2",
          provider: "SARVAM",
          sarvamAttemptId: "s-1",
          tenantId,
          campaignId: null,
          assistantId: null,
          sarvamAgentId: "sarvam-2",
          leadId: "lead-2",
          batchId: null,
          status: "COMPLETED",
          duration: 50,
          lead: { id: "lead-2", name: "Bob", phone: "+912222222222" },
          campaign: null,
          assistant: null,
          sarvamAgent: { id: "sarvam-2", name: "Sarvam Voice" },
          extractionOverview: [],
          extractionInsights: [],
          _count: { goalResults: 0 },
        },
      ];

      vi.mocked(prisma.call.findMany).mockResolvedValue(mockCallsFromDb as any);
      vi.mocked(prisma.call.count).mockResolvedValue(2);

      const result = await repo.list(tenantId, {});

      expect(result.calls).toHaveLength(2);
      expect(result.calls[0].agent).toEqual({ id: "asst-1", name: "Bolna Agent" });
      expect(result.calls[1].agent).toEqual({ id: "sarvam-2", name: "Sarvam Voice" });
      // Deprecated fields should not be present
      expect((result.calls[0] as any).assistant).toBeUndefined();
      expect((result.calls[0] as any).sarvamAgent).toBeUndefined();
    });

    it("applies agentId filter correctly when provider is BOLNA", async () => {
      vi.mocked(prisma.call.findMany).mockResolvedValue([]);
      vi.mocked(prisma.call.count).mockResolvedValue(0);

      await repo.list(tenantId, {
        provider: "BOLNA",
        agentId: "asst-uuid-1",
      });

      expect(prisma.call.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            provider: "BOLNA",
            assistantId: "asst-uuid-1",
          }),
        }),
      );
    });

    it("applies agentId filter correctly when provider is SARVAM", async () => {
      vi.mocked(prisma.call.findMany).mockResolvedValue([]);
      vi.mocked(prisma.call.count).mockResolvedValue(0);

      await repo.list(tenantId, {
        provider: "SARVAM",
        agentId: "sarvam-uuid-1",
      });

      expect(prisma.call.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            provider: "SARVAM",
            sarvamAgentId: "sarvam-uuid-1",
          }),
        }),
      );
    });

    it("applies agentId filter across both providers when provider is not specified", async () => {
      vi.mocked(prisma.call.findMany).mockResolvedValue([]);
      vi.mocked(prisma.call.count).mockResolvedValue(0);

      await repo.list(tenantId, {
        agentId: "any-agent-uuid",
      });

      expect(prisma.call.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            AND: expect.arrayContaining([
              {
                OR: [
                  { assistantId: "any-agent-uuid" },
                  { sarvamAgentId: "any-agent-uuid" },
                ],
              },
            ]),
          }),
        }),
      );
    });
  });

  describe("PrismaCallRepository.findById with unified agent", () => {
    let repo: PrismaCallRepository;

    beforeEach(() => {
      repo = new PrismaCallRepository();
    });

    it("returns unified agent for SARVAM call detail", async () => {
      const mockCall = {
        id: "call-sarvam-123",
        provider: "SARVAM",
        tenantId,
        leadId: "lead-1",
        status: "COMPLETED",
        lead: { id: "lead-1", name: "David", phone: "+911234567890" },
        campaign: null,
        assistant: null,
        sarvamAgent: { id: "sarvam-agent-xyz", name: "Sales Sarvam Agent" },
        callAnalysis: null,
        goalResults: [],
      };

      vi.mocked(prisma.call.findFirst).mockResolvedValue(mockCall as any);

      const result = await repo.findById(tenantId, "call-sarvam-123");

      expect(result).not.toBeNull();
      expect(result?.agent).toEqual({ id: "sarvam-agent-xyz", name: "Sales Sarvam Agent" });
      expect((result as any).assistant).toBeUndefined();
      expect((result as any).sarvamAgent).toBeUndefined();
    });

    it("returns null agent when deleted/missing in call detail", async () => {
      const mockCall = {
        id: "call-orphaned-123",
        provider: "BOLNA",
        tenantId,
        leadId: "lead-1",
        status: "COMPLETED",
        lead: { id: "lead-1", name: "David", phone: "+911234567890" },
        campaign: null,
        assistant: null,
        sarvamAgent: null,
        callAnalysis: null,
        goalResults: [],
      };

      vi.mocked(prisma.call.findFirst).mockResolvedValue(mockCall as any);

      const result = await repo.findById(tenantId, "call-orphaned-123");

      expect(result).not.toBeNull();
      expect(result?.agent).toBeNull();
    });
  });
});
