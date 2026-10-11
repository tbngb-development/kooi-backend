import { Router } from "express";
import type { TenantInboundNumberController } from "./tenant-inbound-number.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";

export function buildTenantInboundNumberRoutes(
  controller: TenantInboundNumberController,
  authenticate: AuthenticateMiddleware,
): Router {
  const router = Router();
  router.use(authenticate.tenant());

  router.get("/", controller.list);
  router.get("/:id", controller.get);

  return router;
}
