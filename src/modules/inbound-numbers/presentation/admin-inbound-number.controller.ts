import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { param } from "../../../shared/utils/paramHelper";
import type { ListInboundNumbersUseCase } from "../application/use-cases/admin/list-inbound-numbers.use-case";
import type { GetInboundNumberUseCase } from "../application/use-cases/admin/get-inbound-number.use-case";
import type { ImportInboundNumbersUseCase } from "../application/use-cases/admin/import-inbound-numbers.use-case";
import type { AssignInboundNumberUseCase } from "../application/use-cases/admin/assign-inbound-number.use-case";
import type { SuspendInboundNumberUseCase } from "../application/use-cases/admin/suspend-inbound-number.use-case";
import type { ReactivateInboundNumberUseCase } from "../application/use-cases/admin/reactivate-inbound-number.use-case";
import type { ReleaseInboundNumberUseCase } from "../application/use-cases/admin/release-inbound-number.use-case";
import type { RetryProviderSyncUseCase } from "../application/use-cases/admin/retry-provider-sync.use-case";
import type { BillInboundNumberRentalsUseCase } from "../application/use-cases/billing/bill-inbound-number-rentals.use-case";
import type { CreateCustomInboundNumberUseCase } from "../application/use-cases/admin/create-custom-inbound-number.use-case";
import type {
  InboundNumberStatus,
  ProviderSyncStatus,
} from "@prisma/client";

export class AdminInboundNumberController {
  constructor(
    private readonly listInboundNumbersUseCase: ListInboundNumbersUseCase,
    private readonly getInboundNumberUseCase: GetInboundNumberUseCase,
    private readonly importInboundNumbersUseCase: ImportInboundNumbersUseCase,
    private readonly createCustomInboundNumberUseCase: CreateCustomInboundNumberUseCase,
    private readonly assignInboundNumberUseCase: AssignInboundNumberUseCase,
    private readonly suspendInboundNumberUseCase: SuspendInboundNumberUseCase,
    private readonly reactivateInboundNumberUseCase: ReactivateInboundNumberUseCase,
    private readonly releaseInboundNumberUseCase: ReleaseInboundNumberUseCase,
    private readonly retryProviderSyncUseCase: RetryProviderSyncUseCase,
    private readonly billInboundNumberRentalsUseCase: BillInboundNumberRentalsUseCase,
  ) {}

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filters = {
        status: req.query.status as InboundNumberStatus | undefined,
        providerSyncStatus: req.query.providerSyncStatus as
          | ProviderSyncStatus
          | undefined,
        tenantId: req.query.tenantId as string | undefined,
        assistantId: req.query.assistantId as string | undefined,
        search: req.query.search as string | undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      };

      const result = await this.listInboundNumbersUseCase.execute(filters);
      sendSuccess(res, result);
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
      const id = param(req, "id");
      const result = await this.getInboundNumberUseCase.execute(id);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  importNumbers = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.importInboundNumbersUseCase.execute({
        bolnaApiKeyId: req.body?.bolnaApiKeyId,
      });
      sendSuccess(res, result, HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  };

  createCustom = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.createCustomInboundNumberUseCase.execute({
        phoneNumber: req.body.phoneNumber,
        provider: req.body.provider,
        providerNumberId: req.body.providerNumberId,
        monthlyRentalPaisa: req.body.monthlyRentalPaisa,
      });
      sendSuccess(res, result, HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  };

  assign = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const id = param(req, "id");
      const result = await this.assignInboundNumberUseCase.execute({
        inboundNumberId: id,
        tenantId: req.body.tenantId,
        assistantId: req.body.assistantId,
        monthlyRentalPaisa: req.body.monthlyRentalPaisa,
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  suspend = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const id = param(req, "id");
      const result = await this.suspendInboundNumberUseCase.execute({
        inboundNumberId: id,
        reason: req.body?.reason,
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  reactivate = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const id = param(req, "id");
      const result = await this.reactivateInboundNumberUseCase.execute({
        inboundNumberId: id,
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  release = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const id = param(req, "id");
      const result = await this.releaseInboundNumberUseCase.execute({
        inboundNumberId: id,
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  retrySync = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const id = param(req, "id");
      const result = await this.retryProviderSyncUseCase.execute({
        inboundNumberId: id,
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  billRentals = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.billInboundNumberRentalsUseCase.execute();
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}
