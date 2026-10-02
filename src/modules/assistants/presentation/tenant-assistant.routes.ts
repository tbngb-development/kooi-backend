import { Router } from "express";
import type { TenantAssistantController } from "./tenant-assistant.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";

export function buildTenantAssistantRoutes(
  controller: TenantAssistantController,
  authenticate: AuthenticateMiddleware,
): Router {
  const router = Router();
  router.use(authenticate.tenant());
  router.get("/", controller.list);
  router.get("/:id", controller.get);
  return router;
}
