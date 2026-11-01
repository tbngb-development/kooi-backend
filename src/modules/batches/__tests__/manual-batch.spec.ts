import { describe, it, expect, vi } from "vitest";
import { EnqueueManualBatchUploadUseCase } from "../application/use-cases/enqueue-manual-batch-upload.use-case";
import type { EnqueueBatchUploadUseCase } from "../application/use-cases/enqueue-batch-upload.use-case";

describe("EnqueueManualBatchUploadUseCase", () => {
  const mockEnqueueBatchUpload = {
    execute: vi.fn(),
  } as unknown as EnqueueBatchUploadUseCase;

  const useCase = new EnqueueManualBatchUploadUseCase(mockEnqueueBatchUpload);

  it("passes undefined name when not provided so standard batch name format can be generated", async () => {
    vi.mocked(mockEnqueueBatchUpload.execute).mockResolvedValueOnce({
      batchId: "batch-1",
      status: "PROCESSING",
      message: "Processing",
    });

    await useCase.execute({
      tenantId: "tenant-1",
      campaignId: "camp-1",
      leads: [{ contact_number: "+919876543210", customer_name: "John Doe" }],
      termsAccepted: true,
      termsVersion: "v1.0",
      runImmediately: true,
    });

    expect(mockEnqueueBatchUpload.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        name: undefined,
        tenantId: "tenant-1",
        campaignId: "camp-1",
        fileName: expect.stringMatching(/^batch-manual-\d+\.csv$/),
        termsAccepted: true,
        termsVersion: "v1.0",
      }),
    );
  });

  it("passes trimmed name when custom name is explicitly provided", async () => {
    vi.mocked(mockEnqueueBatchUpload.execute).mockResolvedValueOnce({
      batchId: "batch-2",
      status: "PROCESSING",
      message: "Processing",
    });

    await useCase.execute({
      name: "  VIP Client Leads  ",
      tenantId: "tenant-1",
      campaignId: "camp-1",
      leads: [{ contact_number: "+919876543210" }],
      termsAccepted: true,
      termsVersion: "v1.0",
      runImmediately: false,
    });

    expect(mockEnqueueBatchUpload.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "VIP Client Leads",
        tenantId: "tenant-1",
        campaignId: "camp-1",
      }),
    );
  });
});

