import { Router } from "express";
import type { AdminPlatformAgentController } from "./admin-platform-agent.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate, validateQuery } from "../../../shared/middleware/validate";
import {
  registerPlatformAgentSchema,
  updatePlatformAgentSchema,
  listPlatformAgentsQuerySchema,
  importFromBolnaSchema,
} from "./platform-agent.schema";

export function buildAdminPlatformAgentRoutes(
  controller: AdminPlatformAgentController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  // ── Bolna Discovery (must be before /:id) ────────────────
  router.get("/bolna/agents", controller.listBolnaAgents);
  router.get("/bolna/agents/:bolnaId/preview", controller.previewBolnaAgent);
  router.post(
    "/import-from-bolna",
    validate(importFromBolnaSchema),
    controller.importFromBolna,
  );

  router.post("/", validate(registerPlatformAgentSchema), controller.register);
  router.get(
    "/",
    validateQuery(listPlatformAgentsQuerySchema),
    controller.list,
  );
  router.get("/:id", controller.get);
  router.patch("/:id", validate(updatePlatformAgentSchema), controller.update);
  router.post("/:id/sync", controller.sync);
  router.post("/:id/sync-blueprint", controller.syncBlueprint);
  router.delete("/:id", controller.remove);

  return router;
}
