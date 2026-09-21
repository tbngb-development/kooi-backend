import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import type { CreateCampaignInput } from "../application/dto/campaign.dto";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { param } from "../../../shared/utils/paramHelper";
import { cleanupUploadedFile } from "../../../shared/middleware/upload";
import type { ListCampaignsUseCase } from "../application/use-cases/list-campaigns.use-case";
import type { GetCampaignUseCase } from "../application/use-cases/get-campaign.use-case";
import type { CreateCampaignUseCase } from "../application/use-cases/create-campaign.use-case";
import type { ParseLeadsUseCase } from "../application/use-cases/parse-leads.use-case";
import type { GetCampaignStatsUseCase } from "../application/use-cases/get-campaign-stats.use-case";
import type { GetCampaignPerformanceUseCase } from "../application/use-cases/get-campaign-performance.use-case";
import type { GetCampaignPerformanceV2UseCase } from "../application/use-cases/get-campaign-performance-v2.use-case";
import type { ExtractCampaignVariablesUseCase } from "../application/use-cases/extract-campaign-variables.use-case";
import type { GetCampaignExtractionOverviewUseCase } from "../application/use-cases/get-campaign-extraction-overview.use-case";

export class TenantCampaignController {
  constructor(
    private readonly listCampaignsUseCase: ListCampaignsUseCase,
    private readonly getCampaignUseCase: GetCampaignUseCase,
    private readonly createCampaignUseCase: CreateCampaignUseCase,
    private readonly parseLeadsUseCase: ParseLeadsUseCase,
    private readonly getCampaignStatsUseCase: GetCampaignStatsUseCase,
    private readonly getCampaignPerformanceUseCase: GetCampaignPerformanceUseCase,
    private readonly getCampaignPerformanceV2UseCase: GetCampaignPerformanceV2UseCase,
    private readonly extractVariablesUseCase: ExtractCampaignVariablesUseCase,
    private readonly getExtractionOverviewUseCase: GetCampaignExtractionOverviewUseCase,
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
      const data = await this.listCampaignsUseCase.execute(tenantId);
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
      const data = await this.getCampaignUseCase.execute(
        tenantId,
        param(req, "id"),
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
      const payload = req.body as CreateCampaignInput;
      const data = await this.createCampaignUseCase.execute(tenantId, payload);
      sendSuccess(res, data, HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  };

  extractVariables = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const filePath = req.file?.path;
    try {
      const { tenantId } = this.getTenant(req);

      if (!req.file || !filePath) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: "PDF file is required",
        });
        return;
      }

      const assistantId = req.body?.assistantId;
      if (!assistantId) {
        cleanupUploadedFile(filePath);
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: "assistantId is required",
        });
        return;
      }

      const result = await this.extractVariablesUseCase.execute(tenantId, {
        assistantId,
        filePath,
        originalFileName: req.file.originalname,
      });

      sendSuccess(
        res,
        result,
        HttpStatus.OK,
        "Variables extracted successfully",
      );
    } catch (err) {
      if (filePath) cleanupUploadedFile(filePath);
      next(err);
    }
  };

  parseLeads = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = this.getTenant(req);
      const campaignId = param(req, "id");

      if (!req.file) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: "No file uploaded",
        });
        return;
      }

      const result = await this.parseLeadsUseCase.execute({
        tenantId,
        campaignId,
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
      });

      sendSuccess(res, result);
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
      const data = await this.getCampaignStatsUseCase.execute(
        tenantId,
        param(req, "id"),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  performance = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = this.getTenant(req);
      const batchId = req.query.batchId as string | undefined;
      const data = await this.getCampaignPerformanceUseCase.execute(
        tenantId,
        param(req, "id"),
        batchId,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  performanceV2 = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = this.getTenant(req);
      const batchId = req.query.batchId as string | undefined;
      const data = await this.getCampaignPerformanceV2UseCase.execute(
        tenantId,
        param(req, "id"),
        batchId,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  extractionOverview = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = this.getTenant(req);
      const campaignId = param(req, "id");
      const batchId = req.query.batchId as string | undefined;

      const data = await this.getExtractionOverviewUseCase.execute({
        tenantId,
        campaignId,
        batchId,
      });

      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}
