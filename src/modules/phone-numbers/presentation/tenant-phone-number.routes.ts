import { Router } from "express";
import type { TenantPhoneNumberController } from "./tenant-phone-number.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";

export function buildTenantPhoneNumberRoutes(
  controller: TenantPhoneNumberController,
  authenticate: AuthenticateMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.tenant());

  router.get("/", controller.list);
  router.get("/assigned", controller.getAssigned);

  return router;
}
