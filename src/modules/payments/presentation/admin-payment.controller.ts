import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import type { GetPaymentSummaryUseCase } from "../application/use-cases/get-payment-summary.use-case";
import type { ListAdminPaymentsUseCase } from "../application/use-cases/list-admin-payments.use-case";
import type { RechargeStatus } from "@prisma/client";

export class AdminPaymentController {
  constructor(
    private readonly summaryUC: GetPaymentSummaryUseCase,
    private readonly listUC: ListAdminPaymentsUseCase,
  ) {}

  summary = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.summaryUC.execute();
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const tenantId = req.query.tenantId as string | undefined;
      const status = req.query.status as RechargeStatus | undefined;

      const data = await this.listUC.execute({
        tenantId,
        status,
        page,
        limit,
      });
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}
