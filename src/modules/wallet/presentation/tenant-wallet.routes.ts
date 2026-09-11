import { Router } from "express";
import type { TenantWalletController } from "./tenant-wallet.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import { validateQuery } from "../../../shared/middleware/validate";
import { listTransactionsQuerySchema } from "./wallet.schema";

export function buildTenantWalletRoutes(
  controller: TenantWalletController,
  authenticate: AuthenticateMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.tenant());

  router.get("/", controller.get);
  router.get(
    "/transactions",
    validateQuery(listTransactionsQuerySchema),
    controller.listTransactions,
  );

  return router;
}
