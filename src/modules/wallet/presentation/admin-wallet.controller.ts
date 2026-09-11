import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { param } from "../../../shared/utils/paramHelper";
import type { GetWalletUseCase } from "../application/use-cases/get-wallet.use-case";
import type { ListTransactionsUseCase } from "../application/use-cases/list-transactions.use-case";
import type { AdjustWalletUseCase } from "../application/use-cases/adjust-wallet.use-case";
import type { AuthRequest } from "../../../shared/types";
import type { ListTransactionsQuery } from "../application/dto/wallet.dto";
import type { AdjustWalletInput } from "../application/dto/admin-wallet.dto";

export class AdminWalletController {
  constructor(
    private readonly getWalletUseCase: GetWalletUseCase,
    private readonly listTransactionsUseCase: ListTransactionsUseCase,
    private readonly adjustWalletUseCase: AdjustWalletUseCase,
  ) {}

  getTenantWallet = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = param(req, "tenantId");
      const wallet = await this.getWalletUseCase.execute(tenantId);
      sendSuccess(res, wallet);
    } catch (err) {
      next(err);
    }
  };

  listTenantTransactions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = param(req, "tenantId");
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

  adjust = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authReq = req as AuthRequest;
      const result = await this.adjustWalletUseCase.execute(
        req.body as AdjustWalletInput,
        authReq.user.userId,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}
