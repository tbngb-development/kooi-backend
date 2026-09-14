import { Router } from "express";
import type { AdminExtractionController } from "./admin-extraction.controller";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { validate, validateQuery } from "../../../shared/middleware/validate";
import {
  createCategorySchema,
  updateCategorySchema,
  listCategoriesQuerySchema,
  createDispositionSchema,
  updateDispositionSchema,
  listDispositionsQuerySchema,
  listBolnaDispositionsQuerySchema,
  importExtractionsFromBolnaSchema,
} from "./extraction.schema";

export function buildAdminExtractionRoutes(
  controller: AdminExtractionController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  // ── Bolna Discovery ──────────────────────────────────────
  router.get(
    "/bolna/agents/:platformAgentId/categories",
    controller.listBolnaCategoriesHandler,
  );
  router.get(
    "/bolna/agents/:platformAgentId/dispositions",
    controller.listBolnaDispositionsHandler,
  );
  router.get(
    "/bolna/dispositions",
    validateQuery(listBolnaDispositionsQuerySchema),
    controller.listBolnaDispositionsHandler,
  );
  router.post(
    "/import-from-bolna",
    validate(importExtractionsFromBolnaSchema),
    controller.importExtractionsFromBolnaHandler,
  );

  // ── Categories ──────────────────────────────────────────────
  router.post(
    "/categories",
    validate(createCategorySchema),
    controller.createCategoryHandler,
  );
  router.get(
    "/categories",
    validateQuery(listCategoriesQuerySchema),
    controller.listCategoriesHandler,
  );
  router.get("/categories/:id", controller.getCategoryHandler);
  router.patch(
    "/categories/:id",
    validate(updateCategorySchema),
    controller.updateCategoryHandler,
  );
  router.delete("/categories/:id", controller.deleteCategoryHandler);
  router.post(
    "/categories/sync/:platformAgentId",
    controller.syncCategoriesHandler,
  );

  // ── Dispositions ────────────────────────────────────────────
  router.post(
    "/dispositions",
    validate(createDispositionSchema),
    controller.createDispositionHandler,
  );
  router.get(
    "/dispositions",
    validateQuery(listDispositionsQuerySchema),
    controller.listDispositionsHandler,
  );
  router.get("/dispositions/:id", controller.getDispositionHandler);
  router.patch(
    "/dispositions/:id",
    validate(updateDispositionSchema),
    controller.updateDispositionHandler,
  );
  router.delete("/dispositions/:id", controller.deleteDispositionHandler);
  router.post(
    "/dispositions/sync/:platformAgentId",
    controller.syncDispositionsHandler,
  );
  return router;
}
