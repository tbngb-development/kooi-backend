import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import { sendSuccess } from "../../../shared/utils/response";
import { AdminMessages } from "../../../shared/constants/messages";
import { param } from "../../../shared/utils/paramHelper";
import prisma from "../../../shared/config/database/prisma";
import type { ListLeadsUseCase } from "../application/use-cases/list-leads.use-case";
import type { GetLeadUseCase } from "../application/use-cases/get-lead.use-case";
import type { GetLeadStatsUseCase } from "../application/use-cases/get-lead-stats.use-case";
import type { ToggleLeadDncUseCase } from "../application/use-cases/toggle-lead-dnc.use-case";
import type { RevealLeadPiiUseCase } from "../application/use-cases/reveal-lead-pii.use-case";
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
    private readonly toggleLeadDncUseCase: ToggleLeadDncUseCase,
    private readonly revealLeadPiiUseCase: RevealLeadPiiUseCase,
  ) {}

  private async resolveTenantId(req: Request, leadId?: string): Promise<string> {
    const tenantId =
      (req.query.tenantId as string) ??
      (req.body?.tenantId as string) ??
      ((req as AuthRequest).user as TenantAuthContext)?.tenantId;

    if (tenantId) return tenantId;

    if (leadId) {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { tenantId: true },
      });
      if (lead?.tenantId) return lead.tenantId;
    }

    throw new TenantBadRequestError(AdminMessages.TENANT_ID_REQUIRED);
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
      const leadId = param(req, "id");
      const tenantId = await this.resolveTenantId(req, leadId);
      const data = await this.getLeadDetailsUseCase.execute(
        tenantId,
        leadId,
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
      const tenantId = await this.resolveTenantId(req);
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
      const leadId = param(req, "id");
      const tenantId = await this.resolveTenantId(req, leadId);
      await this.archiveLeadUseCase.execute(tenantId, leadId);
      sendSuccess(res, { id: leadId }, 200, "Lead archived by Admin");
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
      const leadId = param(req, "id");
      const tenantId = await this.resolveTenantId(req, leadId);
      await this.restoreLeadUseCase.execute(tenantId, leadId);
      sendSuccess(res, { id: leadId }, 200, "Lead restored by Admin");
    } catch (err) {
      next(err);
    }
  };

  toggleDnc = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const leadId = param(req, "id");
      const tenantId = await this.resolveTenantId(req, leadId);
      const { doNotCall, reason } = req.body;
      const adminUserId =
        (req as AuthRequest).user?.userId ?? "platform-admin";

      const data = await this.toggleLeadDncUseCase.execute({
        tenantId,
        leadId,
        doNotCall,
        reason,
        adminUserId,
      });

      sendSuccess(
        res,
        data,
        200,
        doNotCall
          ? "Lead added to Do Not Call registry"
          : "Lead removed from Do Not Call registry",
      );
    } catch (err) {
      next(err);
    }
  };

  revealPii = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const leadId = param(req, "id");
      const tenantId = await this.resolveTenantId(req, leadId);
      const user = (req as AuthRequest).user;
      const adminUserId = user?.userId ?? "platform-admin";
      const adminEmail = "email" in user ? user.email : undefined;
      const reason = req.body?.reason;

      const data = await this.revealLeadPiiUseCase.execute({
        tenantId,
        leadId,
        adminUserId,
        adminEmail,
        reason,
      });

      sendSuccess(res, data, 200, "Lead PII revealed");
    } catch (err) {
      next(err);
    }
  };
}
