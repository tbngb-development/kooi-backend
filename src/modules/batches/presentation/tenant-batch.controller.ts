import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import type { RetryConfig } from "../../../shared/types/bolna.types";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { param } from "../../../shared/utils/paramHelper";
import type { ListBatchesUseCase } from "../application/use-cases/list-batches.use-case";
import type { GetBatchUseCase } from "../application/use-cases/get-batch.use-case";
import type { CreateBatchUseCase } from "../application/use-cases/create-batch.use-case";
import type { RunBatchUseCase } from "../application/use-cases/run-batch.use-case";
import type { ScheduleBatchUseCase } from "../application/use-cases/schedule-batch.use-case";
import type { StopBatchUseCase } from "../application/use-cases/stop-batch.use-case";
import type { ResumeBatchUseCase } from "../application/use-cases/resume-batch.use-case";
import type { DeleteBatchUseCase } from "../application/use-cases/delete-batch.use-case";
import type { GetBatchStatsUseCase } from "../application/use-cases/get-batch-stats.use-case";

export class TenantBatchController {
  constructor(
    private readonly listBatchesUseCase: ListBatchesUseCase,
    private readonly getBatchUseCase: GetBatchUseCase,
    private readonly createBatchUseCase: CreateBatchUseCase,
    private readonly runBatchUseCase: RunBatchUseCase,
    private readonly scheduleBatchUseCase: ScheduleBatchUseCase,
    private readonly stopBatchUseCase: StopBatchUseCase,
    private readonly resumeBatchUseCase: ResumeBatchUseCase,
    private readonly deleteBatchUseCase: DeleteBatchUseCase,
    private readonly getBatchStatsUseCase: GetBatchStatsUseCase,
  ) {}

  private getTenant(req: Request): TenantAuthContext {
    return (req as AuthRequest).user as TenantAuthContext;
  }

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = this.getTenant(req);
      const campaignId = param(req, "campaignId");
      const data = await this.listBatchesUseCase.execute(tenantId, campaignId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  get = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = this.getTenant(req);
      const campaignId = param(req, "campaignId");
      const batchId = param(req, "batchId");
      const data = await this.getBatchUseCase.execute(
        tenantId,
        campaignId,
        batchId,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  create = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = this.getTenant(req);
      const campaignId = param(req, "campaignId");

      if (!req.file) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: "No file uploaded",
        });
        return;
      }

      // 1. Resolve optional retryConfig override
      let retryConfig: RetryConfig | undefined;
      if (req.body.retryConfig) {
        try {
          retryConfig =
            typeof req.body.retryConfig === "string"
              ? (JSON.parse(req.body.retryConfig) as RetryConfig)
              : (req.body.retryConfig as RetryConfig);
        } catch {
          res.status(HttpStatus.BAD_REQUEST).json({
            success: false,
            error: "Invalid retryConfig JSON",
          });
          return;
        }
      }

      // 2. Resolve Solution 1 atomic fields from body parameters
      const scheduledAt = req.body.scheduledAt as string | undefined;
      const runImmediately =
        req.body.runImmediately === "true" || req.body.runImmediately === true;

      // 2b. Resolve terms acceptance (multipart sends strings)
      const termsAccepted =
        req.body.termsAccepted === "true" || req.body.termsAccepted === true;
      const termsVersion = req.body.termsVersion as string | undefined;

      if (!termsAccepted) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: "You must accept the Terms & Conditions to upload leads.",
        });
        return;
      }

      if (!termsVersion || termsVersion.trim().length === 0) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: "termsVersion is required.",
        });
        return;
      }

      const data = await this.createBatchUseCase.execute({
        tenantId,
        campaignId,
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        retryConfig,
        scheduledAt,
        runImmediately,
        termsAccepted: true,
        termsVersion: termsVersion.trim(),
      });

      sendSuccess(res, data, HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  };

  run = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = this.getTenant(req);
      const data = await this.runBatchUseCase.execute(
        tenantId,
        param(req, "campaignId"),
        param(req, "batchId"),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  schedule = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = this.getTenant(req);
      const data = await this.scheduleBatchUseCase.execute(
        tenantId,
        param(req, "campaignId"),
        param(req, "batchId"),
        req.body.scheduledAt,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  stop = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = this.getTenant(req);
      const data = await this.stopBatchUseCase.execute(
        tenantId,
        param(req, "campaignId"),
        param(req, "batchId"),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  resume = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = this.getTenant(req);
      const data = await this.resumeBatchUseCase.execute(
        tenantId,
        param(req, "campaignId"),
        param(req, "batchId"),
      );
      sendSuccess(res, data, HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  };

  remove = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = this.getTenant(req);
      const data = await this.deleteBatchUseCase.execute(
        tenantId,
        param(req, "campaignId"),
        param(req, "batchId"),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  stats = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = this.getTenant(req);
      const data = await this.getBatchStatsUseCase.execute(
        tenantId,
        param(req, "campaignId"),
        param(req, "batchId"),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}
