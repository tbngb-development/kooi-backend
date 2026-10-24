// src/modules/payments/presentation/admin-payment.controller.ts
import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import type { RechargePurpose, RechargeStatus } from "@prisma/client";
import type { ListAdminPaymentsUseCase } from "../application/use-cases/list-admin-payments.use-case";
import type { GetPaymentSummaryUseCase } from "../application/use-cases/get-payment-summary.use-case";
import type { ActivateFreeOnboardingUseCase } from "../application/use-cases/activate-free-onboarding.use-case";
import type { ReconcilePaymentUseCase } from "../application/use-cases/reconcile-payment.use-case";
import type { AuthRequest } from "../../../shared/types";
import type { ActivateFreeOnboardingInput } from "../application/dto/payment.dto";
import { TenantBadRequestError } from "../../tenants/domain/tenant.errors";

export class AdminPaymentController {
  constructor(
    private readonly listPayments: ListAdminPaymentsUseCase,
    private readonly getSummaryUseCase: GetPaymentSummaryUseCase,
    private readonly activateFreeOnboarding: ActivateFreeOnboardingUseCase,
    private readonly reconcilePayment: ReconcilePaymentUseCase,
  ) {}

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const status = req.query.status as RechargeStatus | undefined;
      const purpose = req.query.purpose as RechargePurpose | undefined;
      const tenantId = req.query.tenantId as string | undefined;

      const result = await this.listPayments.execute({
        page,
        limit,
        status,
        purpose,
        tenantId,
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  summary = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = req.query.tenantId as string | undefined;
      if (!tenantId) {
        throw new TenantBadRequestError("Tenant Id is missing");
      }
      const result = await this.getSummaryUseCase.execute(tenantId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  activateFree = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authReq = req as AuthRequest;
      const input = req.body as ActivateFreeOnboardingInput;
      const result = await this.activateFreeOnboarding.execute({
        tenantId: input.tenantId,
        adminUserId: authReq.user.userId,
        waiverReason: input.waiverReason,
      });
      sendSuccess(res, result, HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  };

  reconcile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authReq = req as AuthRequest;
      const { id } = req.params;
      const result = await this.reconcilePayment.execute({
        rechargeId: id as string,
        adminUserId: authReq.user.userId,
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}
