import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaCampaignStopAdapter } from "../infrastructure/adapters/prisma-campaign-stop.adapter";
import prisma from "../../../shared/config/database/prisma";
import type { IBolnaClientFactory } from "../../../shared/config/external/bolna/bolna-client.factory";
import type { ISarvamCampaignClient } from "../../campaigns/infrastructure/clients/sarvam-campaign.client";
import type { ISarvamApiKeyEncryptionService } from "../../sarvam-api-keys/application/interfaces/sarvam-api-key-encryption.interface";
import type { Logger } from "../../../shared/logging/logger.interface";

vi.mock("../../../shared/config/database/prisma", () => ({
  default: {
    leadBatch: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    call: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    lead: {
      updateMany: vi.fn(),
    },
    campaign: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe("PrismaCampaignStopAdapter — Sarvam enforcement stops", () => {
  let bolnaClientFactory: IBolnaClientFactory;
  let sarvamCampaignClient: Pick<ISarvamCampaignClient, "updateStatus">;
  let sarvamEncryptionService: Pick<ISarvamApiKeyEncryptionService, "decrypt">;
  let logger: Logger;

  const tenantId = "tenant-sarvam-only-1";

  beforeEach(() => {
    vi.clearAllMocks();

    bolnaClientFactory = {
      forTenant: vi.fn(),
      forApiKey: vi.fn(),
    } as unknown as IBolnaClientFactory;

    sarvamCampaignClient = {
      updateStatus: vi.fn(),
    };

    sarvamEncryptionService = {
      decrypt: vi.fn().mockReturnValue("plain-api-key"),
    };

    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) =>
      callback(prisma),
    );
  });

  it("stops Sarvam batches locally and records remote cancel failure honestly without rolling back local block", async () => {
    vi.mocked(prisma.leadBatch.findMany)
      .mockResolvedValueOnce([
        {
          id: "batch-sarvam-1",
          tenantId,
          campaignId: "campaign-1",
          status: "RUNNING",
          provider: "SARVAM",
          sarvamCohortId: "cohort-123",
          bolnaBatchId: null,
          campaign: {
            id: "campaign-1",
            provider: "SARVAM",
            sarvamCampaignId: "sarvam-campaign-1",
            sarvamAgentId: "sarvam-agent-1",
            sarvamAgent: {
              apiKey: {
                organizationId: "org-1",
                workspaceId: "ws-1",
                apiKeyEncrypted: "enc-key",
              },
            },
          },
        } as any,
      ])
      .mockResolvedValueOnce([{ status: "STOPPED" } as any]); // campaign finalization

    vi.mocked(prisma.call.findMany).mockResolvedValue([
      { id: "call-1", leadId: "lead-1" } as any,
    ]);

    vi.mocked(sarvamCampaignClient.updateStatus).mockRejectedValue(
      new Error("provider 500"),
    );

    const adapter = new PrismaCampaignStopAdapter({
      bolnaClientFactory,
      sarvamCampaignClient,
      sarvamEncryptionService,
      logger,
    });

    const results = await adapter.stop(tenantId);

    // Local block applied: batch/call/lead updates and campaign finalized.
    expect(prisma.leadBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-sarvam-1" },
      data: { status: "STOPPED" },
    });
    expect(prisma.call.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["call-1"] } },
      data: expect.objectContaining({ status: "STOPPED" }),
    });
    expect(prisma.lead.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ batchId: "batch-sarvam-1" }),
      data: { status: "STOPPED", stoppedReason: "LOW_BALANCE" },
    });
    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: "campaign-1" },
      data: expect.objectContaining({ status: "COMPLETED" }),
    });

    // No Bolna interaction for Sarvam-only enforcement.
    expect(bolnaClientFactory.forTenant).not.toHaveBeenCalled();

    // Honest failure recorded — never reported as success.
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: expect.objectContaining({
            provider: "SARVAM",
            kind: "CAMPAIGN",
            targetId: "campaign-1",
          }),
          success: false,
          error: "provider 500",
        }),
      ]),
    );
    expect(results.every((r) => r.success === false)).toBe(true);
  });

  it("records Bolna stop failure honestly while keeping local DB stops applied", async () => {
    vi.mocked(prisma.leadBatch.findMany)
      .mockResolvedValueOnce([
        {
          id: "batch-bolna-1",
          tenantId,
          campaignId: "campaign-1",
          status: "RUNNING",
          provider: "BOLNA",
          bolnaBatchId: "bolna-batch-xyz",
          sarvamCohortId: null,
          campaign: {
            id: "campaign-1",
            provider: "BOLNA",
            sarvamCampaignId: null,
            sarvamAgentId: null,
            sarvamAgent: null,
          },
        } as any,
      ])
      .mockResolvedValueOnce([{ status: "STOPPED" } as any]);

    vi.mocked(prisma.call.findMany).mockResolvedValue([]);

    const bolnaStop = vi.fn().mockRejectedValue(new Error("bolna 500"));
    vi.mocked(bolnaClientFactory.forTenant).mockResolvedValue({
      batches: { stop: bolnaStop },
    } as any);

    const adapter = new PrismaCampaignStopAdapter({
      bolnaClientFactory,
      sarvamCampaignClient,
      sarvamEncryptionService,
      logger,
    });

    const results = await adapter.stop(tenantId);

    expect(prisma.leadBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-bolna-1" },
      data: { status: "STOPPED" },
    });
    expect(bolnaClientFactory.forTenant).toHaveBeenCalledWith(tenantId);
    expect(bolnaStop).toHaveBeenCalledWith("bolna-batch-xyz");
    expect(results).toEqual([
      expect.objectContaining({
        target: expect.objectContaining({
          provider: "BOLNA",
          kind: "BATCH",
          targetId: "batch-bolna-1",
        }),
        success: false,
        error: "bolna 500",
      }),
    ]);
  });

  it("cancels a scheduled Sarvam campaign with the terminal cancel action and never resumes", async () => {
    vi.mocked(prisma.leadBatch.findMany)
      .mockResolvedValueOnce([
        {
          id: "batch-sarvam-scheduled",
          tenantId,
          campaignId: "campaign-scheduled",
          status: "SCHEDULED",
          provider: "SARVAM",
          bolnaBatchId: null,
          campaign: {
            id: "campaign-scheduled",
            provider: "SARVAM",
            sarvamCampaignId: "sarvam-campaign-scheduled",
            sarvamAgentId: "sarvam-agent-shared",
            sarvamAgent: {
              apiKey: {
                organizationId: "org-scheduled",
                workspaceId: "ws-scheduled",
                apiKeyEncrypted: "enc-key-scheduled",
              },
            },
          },
        } as any,
      ])
      .mockResolvedValueOnce([{ status: "STOPPED" } as any]);

    vi.mocked(prisma.call.findMany).mockResolvedValue([]);
    vi.mocked(sarvamCampaignClient.updateStatus).mockResolvedValue({
      status: "cancelled",
    } as any);

    const adapter = new PrismaCampaignStopAdapter({
      bolnaClientFactory,
      sarvamCampaignClient,
      sarvamEncryptionService,
      logger,
    });

    const results = await adapter.stop(tenantId);

    // Local halt applied to the scheduled batch.
    expect(prisma.leadBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-sarvam-scheduled" },
      data: { status: "STOPPED" },
    });

    // Terminal provider action is `cancel`, never `resume`/`pause`.
    expect(sarvamEncryptionService.decrypt).toHaveBeenCalledWith(
      "enc-key-scheduled",
    );
    expect(sarvamCampaignClient.updateStatus).toHaveBeenCalledTimes(1);
    expect(sarvamCampaignClient.updateStatus).toHaveBeenCalledWith(
      "org-scheduled",
      "ws-scheduled",
      "sarvam-campaign-scheduled",
      "plain-api-key",
      "cancel",
    );
    for (const call of vi.mocked(sarvamCampaignClient.updateStatus).mock.calls) {
      expect(call[4]).toBe("cancel");
      expect(call[4]).not.toBe("resume");
    }

    expect(results).toEqual([
      expect.objectContaining({
        target: expect.objectContaining({
          provider: "SARVAM",
          kind: "CAMPAIGN",
          targetId: "campaign-scheduled",
        }),
        success: true,
        error: null,
      }),
    ]);
    expect(bolnaClientFactory.forTenant).not.toHaveBeenCalled();
  });

  it("issues only a batch stop on Bolna — never an agent-level or individual-call stop", async () => {
    vi.mocked(prisma.leadBatch.findMany)
      .mockResolvedValueOnce([
        {
          id: "batch-bolna-only",
          tenantId,
          campaignId: "campaign-bolna-only",
          status: "RUNNING",
          provider: "BOLNA",
          bolnaBatchId: "bolna-batch-only",
          campaign: {
            id: "campaign-bolna-only",
            provider: "BOLNA",
            sarvamCampaignId: null,
            sarvamAgentId: "shared-agent-id",
            sarvamAgent: null,
          },
        } as any,
      ])
      .mockResolvedValueOnce([{ status: "STOPPED" } as any]);

    vi.mocked(prisma.call.findMany).mockResolvedValue([
      { id: "active-call-1", leadId: "lead-1" } as any,
    ]);

    const batchStop = vi.fn().mockResolvedValue({ state: "stopped" });
    const agentSpies = {
      verify: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    };
    const callStop = vi.fn();
    vi.mocked(bolnaClientFactory.forTenant).mockResolvedValue({
      batches: { stop: batchStop },
      agents: agentSpies,
      calls: { stop: callStop },
    } as any);

    const adapter = new PrismaCampaignStopAdapter({
      bolnaClientFactory,
      sarvamCampaignClient,
      sarvamEncryptionService,
      logger,
    });

    const results = await adapter.stop(tenantId);

    expect(batchStop).toHaveBeenCalledTimes(1);
    expect(batchStop).toHaveBeenCalledWith("bolna-batch-only");
    // No agent-level stop, no shared-agent mutation, no individual call stop.
    expect(Object.values(agentSpies).every((spy) => spy.mock.calls.length === 0)).toBe(
      true,
    );
    expect(callStop).not.toHaveBeenCalled();
    // Sarvam client is untouched for a Bolna-only tenant.
    expect(sarvamCampaignClient.updateStatus).not.toHaveBeenCalled();
    expect(results).toEqual([
      expect.objectContaining({
        target: expect.objectContaining({ provider: "BOLNA", kind: "BATCH" }),
        success: true,
        error: null,
      }),
    ]);
  });

  it("retries a previously failed remote target even when its batch is already STOPPED", async () => {
    vi.mocked(prisma.leadBatch.findMany)
      .mockResolvedValueOnce([
        {
          id: "batch-retry",
          tenantId,
          campaignId: "campaign-retry",
          status: "STOPPED",
          bolnaBatchId: null,
          campaign: {
            id: "campaign-retry",
            provider: "SARVAM",
            sarvamCampaignId: "sarvam-campaign-retry",
            sarvamAgentId: "sarvam-agent-retry",
            sarvamAgent: {
              apiKey: {
                organizationId: "org-1",
                workspaceId: "ws-1",
                apiKeyEncrypted: "enc-key",
              },
            },
          },
        } as any,
      ])
      .mockResolvedValueOnce([{ status: "STOPPED" } as any]);
    vi.mocked(prisma.call.findMany).mockResolvedValue([]);
    vi.mocked(sarvamCampaignClient.updateStatus).mockResolvedValue(
      undefined as any,
    );

    const adapter = new PrismaCampaignStopAdapter({
      bolnaClientFactory,
      sarvamCampaignClient,
      sarvamEncryptionService,
      logger,
    });

    const results = await adapter.stop(tenantId, [
      { provider: "SARVAM", kind: "CAMPAIGN", targetId: "campaign-retry" },
    ]);

    expect(prisma.leadBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { campaignId: { in: ["campaign-retry"] } },
          ]),
        }),
      }),
    );
    expect(sarvamCampaignClient.updateStatus).toHaveBeenCalledWith(
      "org-1",
      "ws-1",
      "sarvam-campaign-retry",
      "plain-api-key",
      "cancel",
    );
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: expect.objectContaining({
            provider: "SARVAM",
            kind: "CAMPAIGN",
            targetId: "campaign-retry",
          }),
          success: true,
          error: null,
        }),
      ]),
    );
  });

  it("keeps an unresolvable retry target failed instead of reporting a clean stop", async () => {
    vi.mocked(prisma.leadBatch.findMany).mockResolvedValueOnce([]);

    const adapter = new PrismaCampaignStopAdapter({
      bolnaClientFactory,
      sarvamCampaignClient,
      sarvamEncryptionService,
      logger,
    });

    const results = await adapter.stop(tenantId, [
      { provider: "BOLNA", kind: "BATCH", targetId: "missing-batch" },
    ]);

    expect(bolnaClientFactory.forTenant).not.toHaveBeenCalled();
    expect(results).toEqual([
      {
        target: { provider: "BOLNA", kind: "BATCH", targetId: "missing-batch" },
        success: false,
        error: "Provider stop target could not be resolved for retry",
      },
    ]);
  });
});
