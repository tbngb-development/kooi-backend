// modules/batches/application/use-cases/retry-failed-batch.use-case.ts

import prisma from "../../../../shared/config/database/prisma";
import type { BatchRepository } from "../interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../../campaigns/application/interfaces/campaign-repository.interface";
import type { ResumeBatchUseCase } from "./resume-batch.use-case";
import { BatchNotFoundError } from "../../domain/errors/batch.errors";
import { CampaignNotFoundError } from "../../../campaigns/domain/errors/campaign.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface RetryFailedBatchResult {
  batchId: string;
  retriedCount: number;
  message: string;
  resumedBatch?: Record<string, unknown>;
}

export class RetryFailedBatchUseCase {
  private readonly log: Logger | undefined;

  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly resumeBatchUseCase: ResumeBatchUseCase,
    logger?: Logger,
  ) {
    this.log = logger?.child({ component: "RetryFailedBatchUseCase" });
  }

  async execute(
    tenantId: string,
    campaignId: string,
    batchId: string,
  ): Promise<RetryFailedBatchResult> {
    // 1. Verify campaign exists
    const campaign = await this.campaignRepo.findById(tenantId, campaignId);
    if (!campaign) throw new CampaignNotFoundError();

    // 2. Verify batch exists
    const batch = await this.batchRepo.findById(tenantId, campaignId, batchId);
    if (!batch) throw new BatchNotFoundError();

    // 3. Find all failed/no-answer/busy leads in this batch
    const failedLeads = await prisma.lead.findMany({
      where: {
        batchId,
        tenantId,
        campaignId,
        status: { in: ["FAILED", "NO_ANSWER", "BUSY"] },
        doNotCall: false,
        isDeleted: false,
      },
      select: { id: true },
    });

    if (failedLeads.length === 0) {
      return {
        batchId,
        retriedCount: 0,
        message: "No eligible failed leads to retry in this batch.",
      };
    }

    const failedLeadIds = failedLeads.map((l: { id: string }) => l.id);

    // 4. Reset failed leads to STOPPED state so resumeBatchUseCase picks them up
    await prisma.lead.updateMany({
      where: { id: { in: failedLeadIds } },
      data: {
        status: "STOPPED",
        stoppedReason: null,
      },
    });

    // 5. If original batch was completed or failed, transition to STOPPED so resumeBatch allows resumption
    if (batch.status !== "STOPPED") {
      await this.batchRepo.update(batchId, {
        status: "STOPPED",
      });
    }

    this.log?.info("Reset failed leads for batch retry", {
      action: "batch.retry_failed.reset_leads",
      batchId,
      retriedCount: failedLeadIds.length,
    });

    // 6. Resume the batch using the standard ResumeBatchUseCase
    const resumeResult = await this.resumeBatchUseCase.execute(
      tenantId,
      campaignId,
      batchId,
    );

    return {
      batchId,
      retriedCount: failedLeadIds.length,
      message: `Successfully queued ${failedLeadIds.length} failed leads for retry.`,
      resumedBatch: resumeResult.newBatch,
    };
  }
}
