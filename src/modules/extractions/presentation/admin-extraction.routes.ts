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
  attachIndustriesSchema,
  attachDispositionsSchema,
  listBolnaCategoriesQuerySchema,
  listBolnaDispositionsQuerySchema,
} from "./extraction.schema";

export function buildAdminExtractionRoutes(
  controller: AdminExtractionController,
  authenticate: AuthenticateMiddleware,
  authorize: AuthorizeMiddleware,
): Router {
  const router = Router();

  router.use(authenticate.admin());
  router.use(authorize.platformAdmin());

  // ── Bolna Preview (Read-Only) ──────────────────────────────────────────────
  router.get(
    "/bolna/categories",
    validateQuery(listBolnaCategoriesQuerySchema),
    controller.previewBolnaCategoriesHandler,
  );
  router.get(
    "/bolna/dispositions",
    validateQuery(listBolnaDispositionsQuerySchema),
    controller.previewBolnaDispositionsHandler,
  );

  // ── Categories CRUD ────────────────────────────────────────────────────────
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

  // ── Categories M2M Associations ────────────────────────────────────────────
  router.post(
    "/categories/:id/industries",
    validate(attachIndustriesSchema),
    controller.attachIndustriesToCategoryHandler,
  );
  router.delete(
    "/categories/:id/industries/:industryPackId",
    controller.detachIndustryFromCategoryHandler,
  );
  router.post(
    "/categories/:id/dispositions",
    validate(attachDispositionsSchema),
    controller.attachDispositionsToCategoryHandler,
  );
  router.delete(
    "/categories/:id/dispositions/:dispositionId",
    controller.detachDispositionFromCategoryHandler,
  );

  // ── Dispositions CRUD ─────────────────────────────────────────────────────
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

  // ── Dispositions M2M Associations ─────────────────────────────────────────
  router.post(
    "/dispositions/:id/industries",
    validate(attachIndustriesSchema),
    controller.attachIndustriesToDispositionHandler,
  );
  router.delete(
    "/dispositions/:id/industries/:industryPackId",
    controller.detachIndustryFromDispositionHandler,
  );

  return router;
}
