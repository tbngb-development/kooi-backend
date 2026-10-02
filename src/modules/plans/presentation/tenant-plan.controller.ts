import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { getTenantContext } from "../../../shared/utils/tenant-context";
import { HttpStatus } from "../../../shared/constants/http-status";
import type { ListPlansUseCase } from "../application/use-cases/list-plans.use-case";
import type { GetTenantPlanUseCase } from "../application/use-cases/get-tenant-plan.use-case";
import type { SelectPlanUseCase } from "../application/use-cases/select-plan.use-case";
import { param } from "../../../shared/utils/paramHelper";
import type { ChangeTenantPlanUseCase } from "../application/use-cases/change-tenant-plan.use-case";

export class TenantPlanController {
  constructor(
    private readonly listPlansUseCase: ListPlansUseCase,
    private readonly getTenantPlanUseCase: GetTenantPlanUseCase,
    private readonly selectPlanUseCase: SelectPlanUseCase,
    private readonly changePlanUseCase: ChangeTenantPlanUseCase,
  ) {}

  listAvailable = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const plans = await this.listPlansUseCase.execute({
        includeInactive: false,
      });
      sendSuccess(res, plans);
    } catch (err) {
      next(err);
    }
  };

  getMine = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = getTenantContext(req);
      const plan = await this.getTenantPlanUseCase.execute(tenantId);
      sendSuccess(res, plan);
    } catch (err) {
      next(err);
    }
  };

  selectPlan = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId, userId } = getTenantContext(req);
      const tenantPlan = await this.selectPlanUseCase.execute(
        tenantId,
        param(req, "planId"),
        userId,
      );
      sendSuccess(res, tenantPlan, HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /v1/plans/change
   * Self-service plan upgrade/downgrade.
   * If an onboarding fee difference exists, returns requiresPayment: true
   * and the frontend should initiate a payment flow.
   */
  changePlan = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId, userId } = getTenantContext(req);
      const { newPlanId } = req.body;

      const result = await this.changePlanUseCase.execute({
        tenantId,
        newPlanId,
        initiatedBy: userId,
      });

      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}
