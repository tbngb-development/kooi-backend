import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { getTenantContext } from "../../../shared/utils/tenant-context";
import type { GetWalletUseCase } from "../application/use-cases/get-wallet.use-case";
import type { ListTransactionsUseCase } from "../application/use-cases/list-transactions.use-case";
import type { ListTransactionsQuery } from "../application/dto/wallet.dto";

export class TenantWalletController {
  constructor(
    private readonly getWalletUseCase: GetWalletUseCase,
    private readonly listTransactionsUseCase: ListTransactionsUseCase,
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
      const result = await this.listTransactionsUseCase.execute(
        tenantId,
        query,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}
