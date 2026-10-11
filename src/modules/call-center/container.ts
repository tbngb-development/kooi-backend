import type { Router } from "express";
import { GetCallCenterKPIsUseCase } from "./application/use-cases/get-call-center-kpis.use-case";
import { GetNumberRosterUseCase } from "./application/use-cases/get-number-roster.use-case";
import { ExportCallCenterCsvUseCase } from "./application/use-cases/export-call-center-csv.use-case";
import { CallCenterController } from "./presentation/call-center.controller";
import { buildCallCenterRoutes } from "./presentation/call-center.routes";
import type { AuthenticateMiddleware } from "../../shared/middleware/authenticate";

export interface CallCenterModuleDeps {
  authenticate: AuthenticateMiddleware;
}

export interface CallCenterModule {
  router: Router;
  controller: CallCenterController;
}

export function createCallCenterModule(
  deps: CallCenterModuleDeps,
): CallCenterModule {
  const getKPIs = new GetCallCenterKPIsUseCase();
  const getNumberRoster = new GetNumberRosterUseCase();
  const exportCsv = new ExportCallCenterCsvUseCase();

  const controller = new CallCenterController(
    getKPIs,
    getNumberRoster,
    exportCsv,
  );

  const router = buildCallCenterRoutes(controller, deps.authenticate);

  return {
    router,
    controller,
  };
}
