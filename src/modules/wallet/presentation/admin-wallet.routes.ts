import { Router } from "express";
import type { AdminWalletController } from "./admin-wallet.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate, validateQuery } from "../../../shared/middleware/validate";
import {
  adjustWalletSchema,
  listTransactionsQuerySchema,
} from "./wallet.schema";

export function buildAdminWalletRoutes(
  controller: AdminWalletController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  router.get("/tenants/:tenantId", controller.getTenantWallet);
  router.get(
    "/tenants/:tenantId/transactions",
    validateQuery(listTransactionsQuerySchema),
    controller.listTenantTransactions,
  );
  router.post("/adjust", validate(adjustWalletSchema), controller.adjust);

  return router;
}
