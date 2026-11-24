import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrismaCampaignRepository } from "../infrastructure/repositories/prisma-campaign.repository";
import prisma from "../../../shared/config/database/prisma";

vi.mock("../../../shared/config/database/prisma", () => ({
  default: {
    campaign: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    sarvamAgent: {
      findFirst: vi.fn(),
    },
    lead: {
      groupBy: vi.fn().mockResolvedValue([]),
    },
    call: {
      groupBy: vi.fn().mockResolvedValue([]),
    },
  },
}));

describe("Campaign Agent Listing - Provider-Aware Agent Resolution", () => {
  let repo: PrismaCampaignRepository;
  const tenantId = "tenant-test-1";

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new PrismaCampaignRepository();
    (repo as any).getTenantCampaignOverview = vi.fn().mockResolvedValue({
      totalCampaigns: 2,
      totalLeads: 10,
      totalCalls: 5,
      runningCampaigns: 1,
    });
    (repo as any).getCampaignMetricsMap = vi.fn().mockResolvedValue(new Map());
    (repo as any).getBatchMetricsMap = vi.fn().mockResolvedValue(new Map());
  });

  it("resolves Bolna assistant under unified agent property for BOLNA campaigns", async () => {
    const mockCampaigns = [
      {
        id: "camp-bolna-1",
        name: "Bolna Outreach",
        description: null,
        status: "RUNNING",
        provider: "BOLNA",
        sarvamCampaignId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
        deletedAt: null,
        assistant: { id: "asst-1", name: "Sales Assistant" },
        sarvamAgent: null,
        batches: [],
      },
    ];

    vi.mocked(prisma.campaign.findMany).mockResolvedValue(mockCampaigns as any);
    vi.mocked(prisma.campaign.count).mockResolvedValue(1);

    const result = await repo.list(tenantId, {});

    expect(result.items).toHaveLength(1);
    expect(result.items[0].agent).toEqual({ id: "asst-1", name: "Sales Assistant" });
    expect(result.items[0].assistant).toEqual({ id: "asst-1", name: "Sales Assistant" });
  });

  it("resolves Sarvam agent under unified agent property for SARVAM campaigns", async () => {
    const mockCampaigns = [
      {
        id: "camp-sarvam-1",
        name: "Sarvam Support",
        description: null,
        status: "RUNNING",
        provider: "SARVAM",
        sarvamCampaignId: "sarvam-camp-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
        deletedAt: null,
        assistant: null,
        sarvamAgent: { id: "sarvam-agent-1", name: "Hindi Bot" },
        batches: [],
      },
    ];

    vi.mocked(prisma.campaign.findMany).mockResolvedValue(mockCampaigns as any);
    vi.mocked(prisma.campaign.count).mockResolvedValue(1);

    const result = await repo.list(tenantId, {});

    expect(result.items).toHaveLength(1);
    expect(result.items[0].agent).toEqual({ id: "sarvam-agent-1", name: "Hindi Bot" });
  });

  it("gracefully returns null agent when agent association is missing", async () => {
    const mockCampaigns = [
      {
        id: "camp-orphan-1",
        name: "Orphaned Campaign",
        description: null,
        status: "DRAFT",
        provider: "SARVAM",
        sarvamCampaignId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
        deletedAt: null,
        assistant: null,
        sarvamAgent: null,
        batches: [],
      },
    ];

    vi.mocked(prisma.campaign.findMany).mockResolvedValue(mockCampaigns as any);
    vi.mocked(prisma.campaign.count).mockResolvedValue(1);

    const result = await repo.list(tenantId, {});

    expect(result.items).toHaveLength(1);
    expect(result.items[0].agent).toBeNull();
  });

  it("includes sarvamAgent name in search query along with campaign name and assistant name", async () => {
    vi.mocked(prisma.campaign.findMany).mockResolvedValue([]);
    vi.mocked(prisma.campaign.count).mockResolvedValue(0);

    await repo.list(tenantId, { search: "Support Agent" });

    expect(prisma.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          OR: [
            { name: { contains: "Support Agent", mode: "insensitive" } },
            { assistant: { name: { contains: "Support Agent", mode: "insensitive" } } },
            { sarvamAgent: { name: { contains: "Support Agent", mode: "insensitive" } } },
          ],
        }),
      }),
    );
  });

  describe("findSarvamAgentWithApiKey", () => {
    it("queries with ACTIVE status, active apiKey, and OR filter for allowTenantVisible and tenantId", async () => {
      const mockAgentRecord = {
        id: "sarvam-agent-1",
        name: "Customer Support",
        appId: "app-123",
        appVersion: 1,
        attemptsPerSecond: 2,
        welcomeMessage: { defaultMessage: "Hello" },
        agentVariables: [],
        connectionConfigs: [],
        retryConfig: {},
        allowedSchedule: null,
        allowTenantVisible: true,
        status: "ACTIVE",
        apiKey: {
          id: "key-1",
          tenantId: "platform-tenant-uuid",
          apiKeyEncrypted: "encrypted",
          workspaceId: "wrk-1",
          organizationId: "org-1",
          isActive: true,
        },
        overrides: [],
        goals: [
          { id: "goal-1", outputVariableName: "lead_status", expectedValue: "interested" },
        ],
      };

      vi.mocked(prisma.sarvamAgent.findFirst).mockResolvedValue(mockAgentRecord as any);

      const agent = await repo.findSarvamAgentWithApiKey(tenantId, "sarvam-agent-1");

      expect(prisma.sarvamAgent.findFirst).toHaveBeenCalledWith({
        where: {
          id: "sarvam-agent-1",
          status: "ACTIVE",
          apiKey: {
            isActive: true,
          },
          OR: [
            { allowTenantVisible: true },
            {
              apiKey: {
                tenantId,
              },
            },
          ],
        },
        include: {
          apiKey: true,
          goals: true,
          overrides: {
            where: { tenantId },
          },
        },
      });

      expect(agent).not.toBeNull();
      expect(agent?.id).toBe("sarvam-agent-1");
      expect(agent?.name).toBe("Customer Support");
      expect(agent?.apiKey.organizationId).toBe("org-1");
      expect(agent?.goals).toHaveLength(1);
    });

    it("returns null when no matching agent is found", async () => {
      vi.mocked(prisma.sarvamAgent.findFirst).mockResolvedValue(null);

      const agent = await repo.findSarvamAgentWithApiKey(tenantId, "non-existent-agent");

      expect(agent).toBeNull();
    });
  });
});

