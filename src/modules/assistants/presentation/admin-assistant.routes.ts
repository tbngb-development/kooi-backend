import { Router } from "express";
import type { AdminAssistantController } from "./admin-assistant.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate } from "../../../shared/middleware/validate";
import {
  registerAssistantSchema,
  updateAssistantSchema,
} from "./assistant.schema";

export function buildAdminAssistantRoutes(
  controller: AdminAssistantController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();
  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  router.get("/", controller.list);
  router.get("/:id", controller.get);
  router.post(
    "/register",
    validate(registerAssistantSchema),
    controller.register,
  );
  router.patch("/:id", validate(updateAssistantSchema), controller.update);
  router.delete("/:id", controller.remove);

  return router;
}
