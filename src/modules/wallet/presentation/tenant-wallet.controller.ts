import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { getTenantContext } from "../../../shared/utils/tenant-context";
import { param } from "../../../shared/utils/paramHelper";
import type { GetWalletUseCase } from "../application/use-cases/get-wallet.use-case";
import type { ListTransactionsUseCase } from "../application/use-cases/list-transactions.use-case";
import type { GetWalletSummaryUseCase } from "../application/use-cases/get-wallet-summary.use-case";
import type { GetTransactionDetailUseCase } from "../application/use-cases/get-transaction-detail.use-case";
import type { ListTransactionsQuery } from "../application/dto/wallet.dto";

export class TenantWalletController {
  constructor(
    private readonly getWalletUseCase: GetWalletUseCase,
    private readonly listTransactionsUseCase: ListTransactionsUseCase,
    private readonly getWalletSummaryUseCase: GetWalletSummaryUseCase,
    private readonly getTransactionDetailUseCase: GetTransactionDetailUseCase,
  ) {}

  get = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = getTenantContext(req);
      const wallet = await this.getWalletUseCase.execute(tenantId);
      sendSuccess(res, wallet);
    } catch (err) {
      next(err);
    }
  };

  listTransactions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = getTenantContext(req);
      const query = req.query as unknown as ListTransactionsQuery;
      // Enforce recharge exclusion for tenant transaction ledger
      const result = await this.listTransactionsUseCase.execute(
        tenantId,
        {
          ...query,
          excludeRecharge: true,
        },
      );
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
      const { tenantId } = getTenantContext(req);
      const result = await this.getWalletSummaryUseCase.execute(tenantId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  getTransaction = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = getTenantContext(req);
      const id = param(req, "id");
      const result = await this.getTransactionDetailUseCase.execute(
        id,
        tenantId,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}
