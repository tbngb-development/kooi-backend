// modules/batches/presentation/admin-batch.controller.ts

import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import { sendSuccess } from "../../../shared/utils/response";
import { AdminMessages } from "../../../shared/constants/messages";
import { param } from "../../../shared/utils/paramHelper";
import type { ListBatchesUseCase } from "../application/use-cases/list-batches.use-case";
import type { GetBatchUseCase } from "../application/use-cases/get-batch.use-case";
import type { GetBatchStatsUseCase } from "../application/use-cases/get-batch-stats.use-case";
import type { ArchiveBatchUseCase } from "../application/use-cases/archive-batch.use-case";
import type { RestoreBatchUseCase } from "../application/use-cases/restore-batch.use-case";
import type { StopBatchUseCase } from "../application/use-cases/stop-batch.use-case";
import type { ResumeBatchUseCase } from "../application/use-cases/resume-batch.use-case";
import type { RetryFailedBatchUseCase } from "../application/use-cases/retry-failed-batch.use-case";
import prisma from "../../../shared/config/database/prisma";
import { TenantBadRequestError } from "../../tenants/domain/tenant.errors";

export class AdminBatchController {
  constructor(
    private readonly listBatchesUseCase: ListBatchesUseCase,
    private readonly getBatchUseCase: GetBatchUseCase,
    private readonly getBatchStatsUseCase: GetBatchStatsUseCase,
    private readonly archiveBatchUseCase: ArchiveBatchUseCase,
    private readonly restoreBatchUseCase: RestoreBatchUseCase,
    private readonly stopBatchUseCase: StopBatchUseCase,
    private readonly resumeBatchUseCase: ResumeBatchUseCase,
    private readonly retryFailedBatchUseCase: RetryFailedBatchUseCase,
  ) {}

  private resolveTenantId(req: Request): string {
    const tenantId =
      (req.query.tenantId as string) ??
      (req.body?.tenantId as string) ??
      ((req as AuthRequest).user as TenantAuthContext)?.tenantId;
    if (!tenantId) throw new TenantBadRequestError(AdminMessages.TENANT_ID_REQUIRED);
    return tenantId;
  }

  private async resolveCampaignId(req: Request, batchId?: string): Promise<string> {
    const campaignId =
      (req.query.campaignId as string) ??
      (req.body?.campaignId as string);
    if (campaignId) return campaignId;
    if (batchId) {
      const batch = await prisma.leadBatch.findUnique({
        where: { id: batchId },
        select: { campaignId: true },
      });
      if (batch?.campaignId) return batch.campaignId;
    }
    throw new Error("campaignId is required");
  }

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const campaignId = await this.resolveCampaignId(req);
      sendSuccess(res, await this.listBatchesUseCase.execute(tenantId, campaignId));
    } catch (err) { next(err); }
  };

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const batchId = param(req, "id");
      const campaignId = await this.resolveCampaignId(req, batchId);
      sendSuccess(res, await this.getBatchUseCase.execute(tenantId, campaignId, batchId));
    } catch (err) { next(err); }
  };

  stats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const batchId = param(req, "id");
      const campaignId = await this.resolveCampaignId(req, batchId);
      sendSuccess(res, await this.getBatchStatsUseCase.execute(tenantId, campaignId, batchId));
    } catch (err) { next(err); }
  };

  archive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const batchId = param(req, "id");
      const campaignId = await this.resolveCampaignId(req, batchId);
      await this.archiveBatchUseCase.execute(tenantId, campaignId, batchId);
      sendSuccess(res, { id: batchId }, 200, "Batch archived by Admin");
    } catch (err) { next(err); }
  };

  restore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const batchId = param(req, "id");
      const campaignId = await this.resolveCampaignId(req, batchId);
      await this.restoreBatchUseCase.execute(tenantId, campaignId, batchId);
      sendSuccess(res, { id: batchId }, 200, "Batch restored by Admin");
    } catch (err) { next(err); }
  };

  abort = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const batchId = param(req, "id");
      const campaignId = await this.resolveCampaignId(req, batchId);
      const data = await this.stopBatchUseCase.execute(tenantId, campaignId, batchId);
      sendSuccess(res, data, 200, "Batch aborted by Admin");
    } catch (err) { next(err); }
  };

  resume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const batchId = param(req, "id");
      const campaignId = await this.resolveCampaignId(req, batchId);
      const data = await this.resumeBatchUseCase.execute(tenantId, campaignId, batchId);
      sendSuccess(res, data, 200, "Batch resumed by Admin");
    } catch (err) { next(err); }
  };

  retryFailed = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const batchId = param(req, "id");
      const campaignId = await this.resolveCampaignId(req, batchId);
      const data = await this.retryFailedBatchUseCase.execute(tenantId, campaignId, batchId);
      sendSuccess(res, data, 200, data.message);
    } catch (err) { next(err); }
  };
}