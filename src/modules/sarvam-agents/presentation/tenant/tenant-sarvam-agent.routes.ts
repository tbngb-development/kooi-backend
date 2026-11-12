import { Router } from "express";
import type { TenantSarvamAgentController } from "./tenant-sarvam-agent.controller";
import type { AuthenticateMiddleware } from "../../../../shared/middleware/authenticate";
import { validate } from "../../../../shared/middleware/validate";
import {
  updateTenantVariablesSchema,
  updateTenantWelcomeMessageSchema,
} from "./tenant-sarvam-agent.schema";

export function buildTenantSarvamAgentRoutes(
  controller: TenantSarvamAgentController,
  authenticate: AuthenticateMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.tenant());

  router.get("/", controller.list);
  router.get("/:id", controller.getById);
  router.get("/:id/configuration", controller.getById);
  router.patch(
    "/:id/variables",
    validate(updateTenantVariablesSchema),
    controller.updateVariables,
  );
  router.patch(
    "/:id/welcome-message",
    validate(updateTenantWelcomeMessageSchema),
    controller.updateWelcomeMessage,
  );

  return router;
}
