import { Router } from "express";
import type { AdminPlatformAgentController } from "./admin-platform-agent.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate } from "../../../shared/middleware/validate";
import {
  registerPlatformAgentSchema,
  updatePlatformAgentSchema,
  importFromBolnaSchema,
  assignCategoriesSchema,
  assignDispositionsSchema,
  updateExtractionConfigSchema, // [NEW]
} from "./platform-agent.schema";

export function buildAdminPlatformAgentRoutes(
  controller: AdminPlatformAgentController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();
  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  // ── discovery endpoints (must precede /:id routes) ─────────────────────────
  router.get("/discover-bolna-agents", controller.listBolnaAgents);
  router.get("/preview-bolna-agent/:bolnaId", controller.previewBolnaAgent);
  router.post(
    "/import-from-bolna",
    validate(importFromBolnaSchema),
    controller.importFromBolna,
  );

  // ── standard platform agent routes ─────────────────────────────────────────
  router.get("/", controller.list);
  router.get("/:id", controller.get);
  router.post("/", validate(registerPlatformAgentSchema), controller.register);
  router.patch("/:id", validate(updatePlatformAgentSchema), controller.update);
  router.post("/:id/sync", controller.sync);
  router.delete("/:id", controller.remove);
  router.post("/:id/sync-blueprint", controller.syncBlueprint);

  // ── dynamic extractions assignment ─────────────────────────────────────────
  router.get("/:id/extractions", controller.getAgentExtractionsHandler);
  router.post(
    "/:id/categories",
    validate(assignCategoriesSchema),
    controller.assignCategoryHandler,
  );
  router.delete(
    "/:id/categories/:categoryId",
    controller.removeCategoryHandler,
  );
  router.post(
    "/:id/dispositions",
    validate(assignDispositionsSchema),
    controller.assignDispositionHandler,
  );
  router.delete(
    "/:id/dispositions/:dispositionId",
    controller.removeDispositionHandler,
  );
  router.post(
    "/:id/extractions/sync",
    controller.syncExtractionsToBolnaHandler,
  );

  router.patch(
    "/:id/extraction-config",
    validate(updateExtractionConfigSchema),
    controller.updatePlatformAgentVariablesHandler,
  );

  return router;
}
