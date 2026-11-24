import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BatchStatus } from "@prisma/client";
import {
  decideCampaignStatusFromBatches,
  evaluateCampaignStatusFromBatches,
} from "../domain/rules/campaign-lifecycle.rules";
import { CampaignStatusReconciler } from "../application/services/campaign-status-reconciler.service";
import type { CampaignStatusReconciliationPort } from "../application/services/campaign-status-reconciler.service";

describe("campaign status reconciliation rule", () => {
  it("keeps the campaign RUNNING while any batch is actively dialing", () => {
    expect(
      evaluateCampaignStatusFromBatches(["COMPLETED", "RUNNING"]),
    ).toBe("RUNNING");
  });

  it("keeps the campaign RUNNING while any batch is still CREATED", () => {
    expect(
      evaluateCampaignStatusFromBatches(["COMPLETED", "CREATED"]),
    ).toBe("RUNNING");
    expect(
      decideCampaignStatusFromBatches(["COMPLETED", "CREATED"]),
    ).toEqual({ action: "mark-running" });
  });

  it("finalizes to COMPLETED when every batch is terminal and at least one completed", () => {
    expect(
      evaluateCampaignStatusFromBatches(["COMPLETED", "STOPPED"]),
    ).toBe("COMPLETED");
    expect(
      decideCampaignStatusFromBatches(["COMPLETED", "FAILED"]),
    ).toEqual({ action: "settle", status: "COMPLETED" });
  });

  it("finalizes to FAILED only when every batch failed", () => {
    expect(evaluateCampaignStatusFromBatches(["FAILED", "FAILED"])).toBe(
      "FAILED",
    );
    expect(
      decideCampaignStatusFromBatches(["FAILED", "STOPPED"]),
    ).toEqual({ action: "settle", status: "COMPLETED" });
  });

  it("defers to legacy checks when there are no batches", () => {
    expect(evaluateCampaignStatusFromBatches([])).toBeNull();
    expect(decideCampaignStatusFromBatches([])).toEqual({ action: "none" });
  });

  it("keeps the campaign RUNNING while a new batch is still processing after an old batch completes", () => {
    expect(
      evaluateCampaignStatusFromBatches(["COMPLETED", "PROCESSING"]),
    ).toBe("RUNNING");
    expect(
      decideCampaignStatusFromBatches(["COMPLETED", "PROCESSING"]),
    ).toEqual({ action: "mark-running" });
  });

  it("finalizes only after every batch is terminal", () => {
    expect(
      decideCampaignStatusFromBatches(["COMPLETED", "COMPLETED"]),
    ).toEqual({ action: "settle", status: "COMPLETED" });
  });
});

describe("CampaignStatusReconciler", () => {
  let port: CampaignStatusReconciliationPort;

  beforeEach(() => {
    port = {
      getAllBatchStatuses: vi.fn().mockResolvedValue([]),
      markCampaignRunningIfActive: vi.fn().mockResolvedValue(true),
      updateCampaignStatus: vi.fn().mockResolvedValue(undefined),
      settleCampaignIfActive: vi.fn().mockResolvedValue(true),
    };
  });

  it("does not write anything when the campaign has no batches", async () => {
    const reconciler = new CampaignStatusReconciler(port);

    const applied = await reconciler.reconcile("campaign-1");

    expect(applied).toBe(false);
    expect(port.markCampaignRunningIfActive).not.toHaveBeenCalled();
    expect(port.updateCampaignStatus).not.toHaveBeenCalled();
    expect(port.settleCampaignIfActive).not.toHaveBeenCalled();
  });

  it("reconciles a CREATED batch to RUNNING through the atomic guard", async () => {
    (port.getAllBatchStatuses as ReturnType<typeof vi.fn>).mockResolvedValue([
      "COMPLETED",
      "CREATED",
    ] satisfies BatchStatus[]);

    const reconciler = new CampaignStatusReconciler(port);
    const applied = await reconciler.reconcile("campaign-1");

    expect(applied).toBe(true);
    expect(port.markCampaignRunningIfActive).toHaveBeenCalledWith(
      "campaign-1",
      expect.any(Date),
    );
    expect(port.settleCampaignIfActive).not.toHaveBeenCalled();
  });

  it("settles atomically once all batches are terminal", async () => {
    (port.getAllBatchStatuses as ReturnType<typeof vi.fn>).mockResolvedValue([
      "COMPLETED",
      "STOPPED",
    ] satisfies BatchStatus[]);

    const reconciler = new CampaignStatusReconciler(port);
    await reconciler.reconcile("campaign-1");

    expect(port.settleCampaignIfActive).toHaveBeenCalledWith(
      "campaign-1",
      "COMPLETED",
      expect.any(Date),
    );
  });

  it("falls back to the plain update when the atomic settle is unavailable", async () => {
    (port.getAllBatchStatuses as ReturnType<typeof vi.fn>).mockResolvedValue([
      "FAILED",
    ] satisfies BatchStatus[]);
    delete port.settleCampaignIfActive;

    const reconciler = new CampaignStatusReconciler(port);
    await reconciler.reconcile("campaign-1");

    expect(port.updateCampaignStatus).toHaveBeenCalledWith(
      "campaign-1",
      "FAILED",
      expect.any(Date),
    );
  });

  it("does not finalize when a late completion arrives while new work remains", async () => {
    (port.getAllBatchStatuses as ReturnType<typeof vi.fn>).mockResolvedValue([
      "COMPLETED",
      "CREATED",
    ] satisfies BatchStatus[]);

    const reconciler = new CampaignStatusReconciler(port);
    await reconciler.reconcile("campaign-1");

    expect(port.markCampaignRunningIfActive).toHaveBeenCalledWith(
      "campaign-1",
      expect.any(Date),
    );
    expect(port.settleCampaignIfActive).not.toHaveBeenCalled();
  });

  it("never falls back to an unguarded write when the atomic settle guard rejects a late finalize", async () => {
    (port.getAllBatchStatuses as ReturnType<typeof vi.fn>).mockResolvedValue([
      "COMPLETED",
      "COMPLETED",
    ] satisfies BatchStatus[]);
    (port.settleCampaignIfActive as ReturnType<typeof vi.fn>).mockResolvedValue(
      false,
    );

    const reconciler = new CampaignStatusReconciler(port);
    const applied = await reconciler.reconcile("campaign-1");

    expect(applied).toBe(false);
    expect(port.settleCampaignIfActive).toHaveBeenCalledWith(
      "campaign-1",
      "COMPLETED",
      expect.any(Date),
    );
    expect(port.updateCampaignStatus).not.toHaveBeenCalled();
  });
});
