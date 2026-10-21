import { Router } from "express";
import type { TenantAssistantController } from "./tenant-assistant.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import { validate } from "../../../shared/middleware/validate";
import { updateAssistantSchema } from "./assistant.schema";

export function buildTenantAssistantRoutes(
  controller: TenantAssistantController,
  authenticate: AuthenticateMiddleware,
): Router {
  const router = Router();
  router.use(authenticate.tenant());
  router.get("/", controller.list);
  router.get("/:id", controller.get);
  router.patch("/:id", validate(updateAssistantSchema), controller.update);
  return router;
}
