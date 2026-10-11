import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import { sendSuccess } from "../../../shared/utils/response";
import { param } from "../../../shared/utils/paramHelper";
import { UnauthorizedError } from "../../../shared/errors";
import type { ListTenantInboundNumbersUseCase } from "../application/use-cases/tenant/list-tenant-inbound-numbers.use-case";
import type { GetTenantInboundNumberUseCase } from "../application/use-cases/tenant/get-tenant-inbound-number.use-case";
import type { InboundNumberStatus } from "@prisma/client";

export class TenantInboundNumberController {
  constructor(
    private readonly listTenantInboundNumbersUseCase: ListTenantInboundNumbersUseCase,
    private readonly getTenantInboundNumberUseCase: GetTenantInboundNumberUseCase,
  ) {}

  private resolveTenantId(req: Request): string {
    const tenantId = ((req as AuthRequest).user as TenantAuthContext)?.tenantId;
    if (!tenantId) {
      throw new UnauthorizedError("Tenant context is required.");
    }
    return tenantId;
  }

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const filters = {
        status: req.query.status as InboundNumberStatus | undefined,
        search: req.query.search as string | undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      };

      const result = await this.listTenantInboundNumbersUseCase.execute(
        tenantId,
        filters,
      );
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
      const tenantId = this.resolveTenantId(req);
      const id = param(req, "id");
      const result = await this.getTenantInboundNumberUseCase.execute(
        tenantId,
        id,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}
