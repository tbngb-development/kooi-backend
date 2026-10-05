import type {
  EnqueueBatchUploadUseCase,
  EnqueueBatchResult,
} from "./enqueue-batch-upload.use-case";
import type { CreateManualBatchInput } from "../dto/batch.dto";
import { serializeManualLeadsToCSV } from "../../infrastructure/manual-leads-csv-serializer";
import type { Logger } from "../../../../shared/logging/logger.interface";

/**
 * Thin adapter that converts a manual JSON lead submission into a CSV buffer
 * and delegates to the existing EnqueueBatchUploadUseCase.
 *
 * This guarantees full behavioral parity with the file-upload path:
 * same validations, same Cloudinary upload, same queue job, same worker pipeline.
 */
export class EnqueueManualBatchUploadUseCase {
  private readonly log: Logger | undefined;

  constructor(
    private readonly enqueueBatchUpload: EnqueueBatchUploadUseCase,
    logger?: Logger,
  ) {
    this.log = logger?.child({ component: "EnqueueManualBatch" });
  }

  async execute(input: CreateManualBatchInput): Promise<EnqueueBatchResult> {
    const csvBuffer = serializeManualLeadsToCSV(input.leads);
    const fileName = `batch-manual-${Date.now()}.csv`;

    this.log?.info("Manual batch serialized to CSV", {
      action: "batch.manual.serialize",
      tenantId: input.tenantId,
      campaignId: input.campaignId,
      leadCount: input.leads.length,
      csvSizeBytes: csvBuffer.length,
    });

    return this.enqueueBatchUpload.execute({
      tenantId: input.tenantId,
      campaignId: input.campaignId,
      fileBuffer: csvBuffer,
      fileName,
      retryConfig: input.retryConfig,
      scheduledAt: input.scheduledAt,
      runImmediately: input.runImmediately,
      termsAccepted: input.termsAccepted,
      termsVersion: input.termsVersion,
    });
  }
}
