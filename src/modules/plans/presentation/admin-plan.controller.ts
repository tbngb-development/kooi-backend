import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { param } from "../../../shared/utils/paramHelper";
import type { ListPlansUseCase } from "../application/use-cases/list-plans.use-case";
import type { GetPlanUseCase } from "../application/use-cases/get-plan.use-case";
import type { CreatePlanUseCase } from "../application/use-cases/create-plan.use-case";
import type { UpdatePlanUseCase } from "../application/use-cases/update-plan.use-case";
import type { CreatePlanVersionUseCase } from "../application/use-cases/create-plan-version.use-case";
import type { PublishPlanVersionUseCase } from "../application/use-cases/publish-plan-version.use-case";
import type { ArchivePlanVersionUseCase } from "../application/use-cases/archive-plan-version.use-case";
import type { UpdateTenantPlanOverridesUseCase } from "../application/use-cases/update-tenant-plan-overrides.use-case";
import type { ChangeTenantPlanUseCase } from "../application/use-cases/change-tenant-plan.use-case";
import type {
  CreatePlanInput,
  UpdatePlanInput,
  CreatePlanVersionInput,
  UpdatePlanOverridesInput,
} from "../application/dto/plan.dto";
import type { AuthRequest } from "../../../shared/types";

export class AdminPlanController {
  constructor(
    private readonly listPlansUseCase: ListPlansUseCase,
    private readonly getPlanUseCase: GetPlanUseCase,
    private readonly createPlanUseCase: CreatePlanUseCase,
    private readonly updatePlanUseCase: UpdatePlanUseCase,
    private readonly createPlanVersionUseCase: CreatePlanVersionUseCase,
    private readonly publishPlanVersionUseCase: PublishPlanVersionUseCase,
    private readonly archivePlanVersionUseCase: ArchivePlanVersionUseCase,
    private readonly updateOverridesUseCase: UpdateTenantPlanOverridesUseCase,
    private readonly changePlanUseCase: ChangeTenantPlanUseCase,
  ) {}

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const plans = await this.listPlansUseCase.execute({ includeInactive });
      sendSuccess(res, plans);
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
      const plan = await this.getPlanUseCase.execute(param(req, "id"));
      sendSuccess(res, plan);
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
      const plan = await this.createPlanUseCase.execute(
        req.body as CreatePlanInput,
      );
      sendSuccess(res, plan, HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  };

  update = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const plan = await this.updatePlanUseCase.execute(
        param(req, "id"),
        req.body as UpdatePlanInput,
      );
      sendSuccess(res, plan);
    } catch (err) {
      next(err);
    }
  };

  createVersion = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const version = await this.createPlanVersionUseCase.execute(
        param(req, "id"),
        req.body as CreatePlanVersionInput,
      );
      sendSuccess(res, version, HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  };

  publishVersion = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const version = await this.publishPlanVersionUseCase.execute(
        param(req, "versionId"),
      );
      sendSuccess(res, version);
    } catch (err) {
      next(err);
    }
  };

  archiveVersion = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const version = await this.archivePlanVersionUseCase.execute(
        param(req, "versionId"),
      );
      sendSuccess(res, version);
    } catch (err) {
      next(err);
    }
  };

  updateTenantOverrides = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authReq = req as AuthRequest;
      const tenantPlan = await this.updateOverridesUseCase.execute(
        param(req, "tenantId"),
        req.body as UpdatePlanOverridesInput,
        authReq.user?.userId,
      );
      sendSuccess(res, tenantPlan);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /v1/admin/plans/tenants/:tenantId/change-plan
   * Admin can change a tenant's plan and optionally waive the fee difference.
   */
  changeTenantPlan = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = param(req, "tenantId");
      const { newPlanId, waiveFee } = req.body;

      const result = await this.changePlanUseCase.execute({
        tenantId,
        newPlanId,
        initiatedBy: authReq.user.userId,
        skipOnboardingFeeDiff: waiveFee === true,
      });

      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}
