import { Router } from "express";
import type { TenantWalletController } from "./tenant-wallet.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";

/**
 * Tenant wallet routes.
 * Mounted at: /api/v1/wallet
 */
export function buildTenantWalletRoutes(
  controller: TenantWalletController,
  authenticate: AuthenticateMiddleware,
): Router {
  const router = Router();
  router.use(authenticate.tenant());

  router.get("/", controller.get);
  router.get("/transactions", controller.listTransactions);

  return router;
}
