import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import { sendSuccess } from "../../../shared/utils/response";
import { UnauthorizedError } from "../../../shared/errors";
import type { GetCallCenterKPIsUseCase } from "../application/use-cases/get-call-center-kpis.use-case";
import type { GetNumberRosterUseCase } from "../application/use-cases/get-number-roster.use-case";
import type { ExportCallCenterCsvUseCase } from "../application/use-cases/export-call-center-csv.use-case";
import type { ExportCallCenterCsvQuery } from "./call-center.schema";

export class CallCenterController {
  constructor(
    private readonly getKPIsUseCase: GetCallCenterKPIsUseCase,
    private readonly getNumberRosterUseCase: GetNumberRosterUseCase,
    private readonly exportCsvUseCase: ExportCallCenterCsvUseCase,
  ) {}

  private resolveTenantId(req: Request): string {
    const tenantId = ((req as AuthRequest).user as TenantAuthContext)?.tenantId;
    if (!tenantId) {
      throw new UnauthorizedError("Tenant context is required.");
    }
    return tenantId;
  }

  getKPIs = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const data = await this.getKPIsUseCase.execute(tenantId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  getNumberRoster = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const data = await this.getNumberRosterUseCase.execute(tenantId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  exportCsv = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const query = req.query as unknown as ExportCallCenterCsvQuery;
      const csv = await this.exportCsvUseCase.execute(tenantId, query);

      const timestamp = new Date().toISOString().split("T")[0];
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="kooi-call-center-${timestamp}.csv"`,
      );
      res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  };
}
