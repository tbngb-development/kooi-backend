import { type WebhookRepository } from "../interfaces/webhook-repository.interface";
import { type WebhookBatchPayload } from "../dto/webhook.dto";
import { type BatchStatus} from "@prisma/client";
import { WebhookResolutionError } from "../../domain/errors/webhook.errors";

export class ProcessBatchWebhookUseCase {
  constructor(private readonly webhookRepo: WebhookRepository) {}

  async execute(payload: WebhookBatchPayload): Promise<void> {
    const bolnaBatchId = payload.batch_id;

    const state = (payload.state ?? payload.status)?.toLowerCase();
    if (!state) return;

    if (!bolnaBatchId) {
      throw new WebhookResolutionError("Missing batch_id context.");
    }

    const leadBatch =
      await this.webhookRepo.findBatchIdByBolnaBatchId(bolnaBatchId);
    if (!leadBatch) return;

    const stateMap: Record<string, BatchStatus> = {
      completed: "COMPLETED",
      stopped: "STOPPED",
      failed: "FAILED",
      running: "RUNNING",
      scheduled: "SCHEDULED",
    };

    const newStatus = stateMap[state];
    if (!newStatus) return;

    // Preserve manual stops locally to allow Resume creation
    if (leadBatch.status === "STOPPED" && newStatus === "COMPLETED") {
      return;
    }

    await this.webhookRepo.updateBatchStatus(
      leadBatch.id,
      newStatus,
      newStatus === "COMPLETED" ? new Date() : undefined,
    );

    const statuses = await this.webhookRepo.getAllBatchStatuses(
      leadBatch.campaignId,
    );
    const terminalStatuses = new Set<BatchStatus>([
      "COMPLETED",
      "STOPPED",
      "FAILED",
    ]);
    const allTerminal = statuses.every((s) => terminalStatuses.has(s));

    if (allTerminal) {
      const allFailed = statuses.every((s) => s === "FAILED");
      await this.webhookRepo.updateCampaignStatus(
        leadBatch.campaignId,
        allFailed ? "FAILED" : "COMPLETED",
        new Date(),
      );
    }
  }
}
