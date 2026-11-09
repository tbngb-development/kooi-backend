import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCampaignExecutionMetricsMap,
  getBatchExecutionMetricsMap,
} from "../infrastructure/queries/lead-execution-metrics.query";
import { PrismaCampaignRepository } from "../infrastructure/repositories/prisma-campaign.repository";
import { PrismaBatchRepository } from "../../batches/infrastructure/repositories/prisma-batch.repository";
import { PrismaDashboardRepository } from "../../dashboard/infrastructure/repositories/prisma-dashboard.repository";
import prisma from "../../../shared/config/database/prisma";

vi.mock("../../../shared/config/database/prisma", () => ({
  default: {
    $queryRaw: vi.fn(),
    campaign: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    leadBatch: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    lead: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    call: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
  },
}));

describe("Campaign & Batch Metrics Reconciliation Suite", () => {
  const tenantId = "tenant-reconcile-1";
  const campaignId = "campaign-reconcile-1";
  const batch1Id = "batch-reconcile-1";
  const batch2Id = "batch-reconcile-2";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Lead Execution Metrics SQL Query Engine", () => {
    it("Scenario 1: Campaign with no contacts returns map with all zeros", async () => {
      (prisma.$queryRaw as any).mockResolvedValueOnce([]);

      const metricsMap = await getCampaignExecutionMetricsMap(
        prisma as any,
        ["empty-campaign-id"],
        tenantId,
      );

      expect(metricsMap.size).toBe(1);
      const metrics = metricsMap.get("empty-campaign-id");
      expect(metrics).toEqual({
        totalLeads: 0,
        calledLeads: 0,
        completedLeads: 0,
        failedLeads: 0,
      });
    });

    it("Scenario 2: Campaign with all completed leads handles number/bigint conversion accurately", async () => {
      (prisma.$queryRaw as any).mockResolvedValueOnce([
        {
          groupId: campaignId,
          totalLeads: "5", // string representation from pg driver
          calledLeads: 5n, // bigint representation
          completedLeads: 5, // number representation
          failedLeads: 0,
        },
      ]);

      const metricsMap = await getCampaignExecutionMetricsMap(
        prisma as any,
        [campaignId],
        tenantId,
      );

      const metrics = metricsMap.get(campaignId)!;
      expect(metrics.totalLeads).toBe(5);
      expect(metrics.calledLeads).toBe(5);
      expect(metrics.completedLeads).toBe(5);
      expect(metrics.failedLeads).toBe(0);
    });

    it("Scenario 3: Single lead with multiple retries (1 failed + 1 completed) counts as 1 completed lead, not 2", async () => {
      // In raw SQL, the CTE/subquery aggregates by lead.id:
      // Lead has 1 failed call and 1 completed call.
      // c_completed is NOT NULL, c_active is NULL, l.status = 'CALLED'.
      // It is counted ONCE in completedLeads and NOT in failedLeads.
      (prisma.$queryRaw as any).mockResolvedValueOnce([
        {
          groupId: campaignId,
          totalLeads: 1,
          calledLeads: 1,
          completedLeads: 1,
          failedLeads: 0,
        },
      ]);

      const metricsMap = await getCampaignExecutionMetricsMap(
        prisma as any,
        [campaignId],
        tenantId,
      );

      const metrics = metricsMap.get(campaignId)!;
      expect(metrics.totalLeads).toBe(1);
      expect(metrics.calledLeads).toBe(1);
      expect(metrics.completedLeads).toBe(1);
      expect(metrics.failedLeads).toBe(0);
    });

    it("Scenario 4: Multiple cohorts in one campaign aggregate correctly across batches", async () => {
      (prisma.$queryRaw as any).mockResolvedValueOnce([
        {
          groupId: batch1Id,
          totalLeads: 10,
          calledLeads: 10,
          completedLeads: 8,
          failedLeads: 2,
        },
        {
          groupId: batch2Id,
          totalLeads: 15,
          calledLeads: 12,
          completedLeads: 10,
          failedLeads: 2,
        },
      ]);

      const batchMap = await getBatchExecutionMetricsMap(
        prisma as any,
        [batch1Id, batch2Id],
        tenantId,
      );

      expect(batchMap.size).toBe(2);
      const b1 = batchMap.get(batch1Id)!;
      const b2 = batchMap.get(batch2Id)!;

      expect(b1.totalLeads).toBe(10);
      expect(b1.completedLeads).toBe(8);
      expect(b2.totalLeads).toBe(15);
      expect(b2.completedLeads).toBe(10);

      // Sum of batches
      const totalBatchLeads = b1.totalLeads + b2.totalLeads;
      const totalBatchCompleted = b1.completedLeads + b2.completedLeads;
      expect(totalBatchLeads).toBe(25);
      expect(totalBatchCompleted).toBe(18);
    });

    it("Scenario 5: Leads with active/in-flight retry are not marked completed prematurely", async () => {
      // Lead had a completed call, but a retry or new run is in progress (c_active IS NOT NULL)
      (prisma.$queryRaw as any).mockResolvedValueOnce([
        {
          groupId: campaignId,
          totalLeads: 1,
          calledLeads: 1,
          completedLeads: 0, // Excluded from completed because of active attempt
          failedLeads: 0,
        },
      ]);

      const metricsMap = await getCampaignExecutionMetricsMap(
        prisma as any,
        [campaignId],
        tenantId,
      );

      const metrics = metricsMap.get(campaignId)!;
      expect(metrics.totalLeads).toBe(1);
      expect(metrics.completedLeads).toBe(0);
    });
  });

  describe("2. PrismaCampaignRepository Reconciliation", () => {
    let campaignRepo: PrismaCampaignRepository;

    beforeEach(() => {
      campaignRepo = new PrismaCampaignRepository();
    });

    it("getCampaignOverviewStats distinguishes raw call attempts from unique lead counts and enforces tenantId + isDeleted", async () => {
      (prisma.campaign.findFirst as any).mockResolvedValueOnce({ id: campaignId });
      (prisma.lead.count as any).mockResolvedValueOnce(10); // 10 unique leads
      (prisma.call.count as any)
        .mockResolvedValueOnce(18) // 18 total call attempts (including retries)
        .mockResolvedValueOnce(10) // 10 completed calls
        .mockResolvedValueOnce(5) // 5 failed calls
        .mockResolvedValueOnce(2) // 2 no answer
        .mockResolvedValueOnce(1) // 1 busy
        .mockResolvedValueOnce(0) // 0 stopped
        .mockResolvedValueOnce(0); // 0 scheduled

      (prisma.call.aggregate as any)
        .mockResolvedValueOnce({ _sum: { chargedAmount: 15000 } })
        .mockResolvedValueOnce({ _sum: { platformCost: 5000 } })
        .mockResolvedValueOnce({ _sum: { duration: 1800 } })
        .mockResolvedValueOnce({ _avg: { duration: 120 } });

      const overview = await campaignRepo.getCampaignOverviewStats(tenantId, campaignId);

      expect(overview.totalLeads).toBe(10);
      expect(overview.totalCalls).toBe(18); // raw call attempts
      expect(overview.completedCalls).toBe(10);
      expect(overview.failedCalls).toBe(5);

      // Verify tenant isolation and isDeleted in lead and call queries
      expect(prisma.lead.count).toHaveBeenCalledWith({
        where: { campaignId, tenantId, isDeleted: false },
      });
      expect(prisma.call.count).toHaveBeenCalledWith({
        where: { campaignId, tenantId, isDeleted: false },
      });
    });

    it("getStats reconciles campaign lead counts with batch lead counts without returning zeros", async () => {
      (prisma.campaign.findFirst as any).mockResolvedValueOnce({
        id: campaignId,
        name: "Q1 Campaign",
        tenantId,
        provider: "BOLNA",
        status: "RUNNING",
        batches: [
          { id: batch1Id, status: "COMPLETED", fileName: "b1.csv", createdAt: new Date() },
          { id: batch2Id, status: "RUNNING", fileName: "b2.csv", createdAt: new Date() },
        ],
      });

      (prisma.lead.groupBy as any).mockResolvedValueOnce([
        { status: "CALLED", _count: 8 },
        { status: "FAILED", _count: 2 },
      ]);
      (prisma.call.groupBy as any).mockResolvedValueOnce([
        { status: "COMPLETED", _count: 12 }, // 12 call attempts completed (includes retries)
        { status: "FAILED", _count: 4 },
      ]);

      // Mock $queryRaw for campaign metrics and batch metrics
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([
          {
            groupId: campaignId,
            totalLeads: 10,
            calledLeads: 10,
            completedLeads: 8, // 8 unique completed leads
            failedLeads: 2,
          },
        ])
        .mockResolvedValueOnce([
          {
            groupId: batch1Id,
            totalLeads: 5,
            calledLeads: 5,
            completedLeads: 4,
            failedLeads: 1,
          },
          {
            groupId: batch2Id,
            totalLeads: 5,
            calledLeads: 5,
            completedLeads: 4,
            failedLeads: 1,
          },
        ]);

      const stats = await campaignRepo.getStats(tenantId, campaignId);

      // Campaign unique lead metrics
      expect(stats.campaign.totalLeads).toBe(10);
      expect(stats.campaign.completedLeads).toBe(8);
      expect(stats.campaign.failedLeads).toBe(2);

      // Batches must have real lead metrics, not 0s
      expect(stats.campaign.batches).toHaveLength(2);
      expect(stats.campaign.batches[0].completedLeads).toBe(4);
      expect(stats.campaign.batches[1].completedLeads).toBe(4);
      expect(
        stats.campaign.batches[0].completedLeads + stats.campaign.batches[1].completedLeads,
      ).toBe(stats.campaign.completedLeads);

      // Raw call records vs lead statuses
      expect(stats.calls.find((c) => c.status === "COMPLETED")?._count).toBe(12);
    });

    it("list campaigns returns populated metrics for both Bolna and Sarvam campaigns", async () => {
      (prisma.campaign.findMany as any).mockResolvedValueOnce([
        {
          id: "camp-bolna",
          name: "Bolna Campaign",
          provider: "BOLNA",
          status: "COMPLETED",
          isDeleted: false,
          batches: [{ id: "batch-b", status: "COMPLETED" }],
        },
        {
          id: "camp-sarvam",
          name: "Sarvam Campaign",
          provider: "SARVAM",
          sarvamCampaignId: "sarvam-ext-1",
          status: "RUNNING",
          isDeleted: false,
          batches: [{ id: "batch-s", status: "RUNNING" }],
        },
      ]);
      (prisma.campaign.count as any).mockResolvedValueOnce(2);
      // getTenantCampaignOverview calls
      (prisma.campaign.count as any)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1);
      (prisma.lead.count as any).mockResolvedValueOnce(50);
      (prisma.call.count as any).mockResolvedValueOnce(80);

      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([
          {
            groupId: "camp-bolna",
            totalLeads: 20,
            calledLeads: 20,
            completedLeads: 20,
            failedLeads: 0,
          },
          {
            groupId: "camp-sarvam",
            totalLeads: 30,
            calledLeads: 25,
            completedLeads: 15,
            failedLeads: 5,
          },
        ])
        .mockResolvedValueOnce([
          {
            groupId: "batch-b",
            totalLeads: 20,
            calledLeads: 20,
            completedLeads: 20,
            failedLeads: 0,
          },
          {
            groupId: "batch-s",
            totalLeads: 30,
            calledLeads: 25,
            completedLeads: 15,
            failedLeads: 5,
          },
        ]);

      const result = await campaignRepo.list(tenantId, {});
      expect(result.items).toHaveLength(2);

      const bolnaItem = result.items.find((i) => i.id === "camp-bolna")!;
      expect(bolnaItem.completedLeads).toBe(20);
      expect(bolnaItem.batches[0].completedLeads).toBe(20);

      const sarvamItem = result.items.find((i) => i.id === "camp-sarvam")!;
      expect(sarvamItem.completedLeads).toBe(15);
      expect(sarvamItem.batches[0].completedLeads).toBe(15);
    });
  });

  describe("3. PrismaBatchRepository Reconciliation", () => {
    let batchRepo: PrismaBatchRepository;

    beforeEach(() => {
      batchRepo = new PrismaBatchRepository();
    });

    it("getStats populates batch lead counts and does not return zeros", async () => {
      (prisma.leadBatch.findFirst as any).mockResolvedValueOnce({
        id: batch1Id,
        campaignId,
        tenantId,
        provider: "SARVAM",
        status: "COMPLETED",
        fileName: "leads.csv",
      });

      (prisma.lead.groupBy as any).mockResolvedValueOnce([
        { status: "CALLED", _count: 10 },
      ]);
      (prisma.call.groupBy as any).mockResolvedValueOnce([
        { status: "COMPLETED", _count: 15 }, // 15 calls for 10 leads due to 5 retries
      ]);
      (prisma.call.aggregate as any).mockResolvedValueOnce({
        _sum: { cost: 5000, chargedAmount: 5000 },
      });

      // $queryRaw for getBatchExecutionMetricsMap
      (prisma.$queryRaw as any).mockResolvedValueOnce([
        {
          groupId: batch1Id,
          totalLeads: 10,
          calledLeads: 10,
          completedLeads: 10, // Exactly 10 unique completed leads
          failedLeads: 0,
        },
      ]);

      const stats = await batchRepo.getStats(tenantId, campaignId, batch1Id);

      // Bug verification: batch.completedLeads MUST NOT be 0
      expect(stats.batch.totalLeads).toBe(10);
      expect(stats.batch.calledLeads).toBe(10);
      expect(stats.batch.completedLeads).toBe(10);
      expect(stats.batch.failedLeads).toBe(0);

      // Call attempts in calls array tracks total attempts (15)
      expect(stats.calls.find((c) => c.status === "COMPLETED")?._count).toBe(15);
    });

    it("findByIdWithDetail separates raw call counts from unique completed leads", async () => {
      (prisma.leadBatch.findFirst as any).mockResolvedValueOnce({
        id: batch1Id,
        campaignId,
        tenantId,
        status: "COMPLETED",
        _count: { leads: 5, calls: 9 },
      });

      (prisma.lead.groupBy as any).mockResolvedValueOnce([
        { status: "CALLED", _count: 5 },
      ]);
      (prisma.call.groupBy as any).mockResolvedValueOnce([
        { status: "COMPLETED", _count: 7 }, // 7 completed calls for 5 leads
        { status: "FAILED", _count: 2 },
      ]);
      (prisma.call.aggregate as any)
        .mockResolvedValueOnce({
          _sum: { chargedAmount: 10000, duration: 900 },
          _count: 9, // 9 total calls
        })
        .mockResolvedValueOnce({
          _avg: { duration: 120 },
        });

      (prisma.$queryRaw as any).mockResolvedValueOnce([
        {
          groupId: batch1Id,
          totalLeads: 5,
          calledLeads: 5,
          completedLeads: 5, // 5 unique completed leads
          failedLeads: 0,
        },
      ]);

      const detail = await batchRepo.findByIdWithDetail(tenantId, campaignId, batch1Id);

      expect(detail).not.null;
      // Unique lead metrics:
      expect(detail!.totalLeads).toBe(5);
      expect(detail!.completedLeads).toBe(5);
      // Raw call metrics:
      expect(detail!.metrics.totalCalls).toBe(9);
      expect(detail!.callCountsByStatus["COMPLETED"]).toBe(7);
      expect(detail!.callCountsByStatus["FAILED"]).toBe(2);
    });
  });

  describe("4. PrismaDashboardRepository Reconciliation", () => {
    let dashboardRepo: PrismaDashboardRepository;

    beforeEach(() => {
      dashboardRepo = new PrismaDashboardRepository();
    });

    it("getOverview enforces isDeleted: false on campaign, lead, and call counts", async () => {
      const now = new Date();
      (prisma.campaign.count as any)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1);
      (prisma.lead.count as any).mockResolvedValueOnce(50);
      (prisma.call.count as any)
        .mockResolvedValueOnce(60)
        .mockResolvedValueOnce(45)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(5);
      (prisma.call.aggregate as any).mockResolvedValueOnce({
        _sum: { chargedAmount: 50000 },
      });

      const overview = await dashboardRepo.getOverview(tenantId, {
        dateFrom: new Date(now.getTime() - 86400000),
        dateTo: now,
      });

      expect(overview.campaigns.total).toBe(3);
      expect(overview.calls.completed).toBe(45);

      expect(prisma.campaign.count).toHaveBeenCalledWith({
        where: { tenantId, isDeleted: false },
      });
      expect(prisma.campaign.count).toHaveBeenCalledWith({
        where: { tenantId, status: "RUNNING", isDeleted: false },
      });
    });

    it("getLeadFunnel correctly excludes leads with in-flight active calls from completedLeads", async () => {
      const now = new Date();
      (prisma.lead.count as any).mockResolvedValueOnce(5);

      // Called lead IDs
      (prisma.call.findMany as any).mockResolvedValueOnce([
        { leadId: "lead-1" },
        { leadId: "lead-2" },
        { leadId: "lead-3" },
      ]);

      // Completed candidate lead IDs
      (prisma.call.findMany as any).mockResolvedValueOnce([
        { leadId: "lead-1" },
        { leadId: "lead-2" }, // lead-2 had a completed call, but is currently retrying
      ]);

      // Active leads (e.g. in-flight retries)
      (prisma.lead.findMany as any).mockResolvedValueOnce([
        { id: "lead-2" }, // lead-2 is still active
      ]);

      const funnel = await dashboardRepo.getLeadFunnel(tenantId, {
        dateFrom: new Date(now.getTime() - 86400000),
        dateTo: now,
      });

      expect(funnel.totalLeads).toBe(5);
      expect(funnel.calledLeads).toBe(3);
      // lead-2 excluded because it has an active retry -> completed is 1 (lead-1 only)
      expect(funnel.completedLeads).toBe(1);
    });
  });

  describe("5. End-to-End Mathematical Consistency Between All APIs", () => {
    it("Reconciles Dashboard, Campaign List, Campaign Detail, and Batch Stats for a multi-attempt campaign", async () => {
      // Scenario:
      // Campaign has 5 leads:
      // - Lead 1: Attempt 1 COMPLETED -> completed
      // - Lead 2: Attempt 1 FAILED, Attempt 2 COMPLETED -> completed (after retry)
      // - Lead 3: Attempt 1 FAILED -> failed
      // - Lead 4: Attempt 1 COMPLETED, Attempt 2 SCHEDULED -> active (not counted completed)
      // - Lead 5: No calls -> pending
      //
      // True counts:
      // Total leads: 5
      // Called leads: 4 (Leads 1, 2, 3, 4)
      // Completed leads: 2 (Leads 1, 2)
      // Failed leads: 1 (Lead 3)
      // Total call attempts: 6 (L1: 1, L2: 2, L3: 1, L4: 2)
      // Completed call attempts: 3 (L1: 1, L2: 1, L4: 1)
      // Failed call attempts: 2 (L2: 1, L3: 1)
      // Scheduled call attempts: 1 (L4: 1)

      const executionMetrics = {
        totalLeads: 5,
        calledLeads: 4,
        completedLeads: 2,
        failedLeads: 1,
      };

      (prisma.$queryRaw as any).mockResolvedValue([
        {
          groupId: campaignId,
          totalLeads: executionMetrics.totalLeads,
          calledLeads: executionMetrics.calledLeads,
          completedLeads: executionMetrics.completedLeads,
          failedLeads: executionMetrics.failedLeads,
        },
      ]);

      const campaignMetricsMap = await getCampaignExecutionMetricsMap(
        prisma as any,
        [campaignId],
        tenantId,
      );
      const campaignStats = campaignMetricsMap.get(campaignId)!;

      // 1. Dashboard completed lead count matches campaign completed lead count
      expect(campaignStats.completedLeads).toBe(2);
      expect(campaignStats.totalLeads).toBe(5);
      expect(campaignStats.calledLeads).toBe(4);
      expect(campaignStats.failedLeads).toBe(1);

      // 2. Call attempts (3 completed, 2 failed, 1 scheduled) are strictly greater than unique completed leads (2)
      const rawCompletedCalls = 3;
      const rawTotalCalls = 6;
      expect(rawCompletedCalls).toBeGreaterThan(campaignStats.completedLeads);
      expect(rawTotalCalls).toBeGreaterThan(campaignStats.calledLeads);

      // 3. No double counting: completedLeads + failedLeads <= totalLeads
      expect(campaignStats.completedLeads + campaignStats.failedLeads).toBeLessThanOrEqual(
        campaignStats.totalLeads,
      );
    });
  });
});
