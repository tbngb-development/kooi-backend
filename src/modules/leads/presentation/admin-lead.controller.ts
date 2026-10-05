import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import { sendSuccess } from "../../../shared/utils/response";
import { AdminMessages } from "../../../shared/constants/messages";
import { param } from "../../../shared/utils/paramHelper";
import type { ListLeadsUseCase } from "../application/use-cases/list-leads.use-case";
import type { GetLeadUseCase } from "../application/use-cases/get-lead.use-case";
import type { GetLeadStatsUseCase } from "../application/use-cases/get-lead-stats.use-case";
import { TenantBadRequestError } from "../../tenants/domain/tenant.errors";
import {
  adminListLeadsQuerySchema,
  type AdminGetLeadsStatsQuery,
} from "./lead.schema";
import type { ArchiveLeadUseCase } from "../application/use-cases/archive-lead.use-case";
import type { RestoreLeadUseCase } from "../application/use-cases/restore-lead.use-case";

export class AdminLeadController {
  constructor(
    private readonly listLeadsUseCase: ListLeadsUseCase,
    private readonly getLeadDetailsUseCase: GetLeadUseCase,
    private readonly getLeadStatsUseCase: GetLeadStatsUseCase,
    private readonly archiveLeadUseCase: ArchiveLeadUseCase,
    private readonly restoreLeadUseCase: RestoreLeadUseCase,
  ) {}

  private resolveTenantId(req: Request): string {
    const tenantId =
      (req.query.tenantId as string) ??
      (req.body?.tenantId as string) ??
      ((req as AuthRequest).user as TenantAuthContext)?.tenantId;

    if (!tenantId) {
      throw new TenantBadRequestError(AdminMessages.TENANT_ID_REQUIRED);
    }
    return tenantId;
  }

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = adminListLeadsQuerySchema.parse(req.query);

      const data = await this.listLeadsUseCase.execute({
        ...query,
      });

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
      const tenantId = this.resolveTenantId(req);
      const data = await this.getLeadDetailsUseCase.execute(
        tenantId,
        param(req, "id"),
      );
      sendSuccess(res, data);
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
      const tenantId = this.resolveTenantId(req);
      const query = req.query as unknown as AdminGetLeadsStatsQuery;
      const data = await this.getLeadStatsUseCase.execute(
        tenantId,
        query.campaignId,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  archive = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      await this.archiveLeadUseCase.execute(tenantId, param(req, "id"));
      sendSuccess(res, { id: param(req, "id") }, 200, "Lead archived by Admin");
    } catch (err) {
      next(err);
    }
  };

  restore = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      await this.restoreLeadUseCase.execute(tenantId, param(req, "id"));
      sendSuccess(res, { id: param(req, "id") }, 200, "Lead restored by Admin");
    } catch (err) {
      next(err);
    }
  };
}
