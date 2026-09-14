import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { param } from "../../../shared/utils/paramHelper";
import type { CreateCategoryUseCase } from "../application/use-cases/create-category.use-case";
import type { UpdateCategoryUseCase } from "../application/use-cases/update-category.use-case";
import type { DeleteCategoryUseCase } from "../application/use-cases/delete-category.use-case";
import type { GetCategoryUseCase } from "../application/use-cases/get-category.use-case";
import type { ListCategoriesUseCase } from "../application/use-cases/list-categories.use-case";
import type { SyncCategoriesFromBolnaUseCase } from "../application/use-cases/sync-categories-from-bolna.use-case";
import type { CreateDispositionUseCase } from "../application/use-cases/create-disposition.use-case";
import type { UpdateDispositionUseCase } from "../application/use-cases/update-disposition.use-case";
import type { DeleteDispositionUseCase } from "../application/use-cases/delete-disposition.use-case";
import type { GetDispositionUseCase } from "../application/use-cases/get-disposition.use-case";
import type { ListDispositionsUseCase } from "../application/use-cases/list-dispositions.use-case";
import type { SyncDispositionsFromBolnaUseCase } from "../application/use-cases/sync-dispositions-from-bolna.use-case";
import type { ListBolnaCategoriesUseCase } from "../application/use-cases/list-bolna-categories.use-case";
import type { ListBolnaDispositionsUseCase } from "../application/use-cases/list-bolna-dispositions.use-case";
import type { ImportExtractionsFromBolnaUseCase } from "../application/use-cases/import-extractions-from-bolna.use-case";

export class AdminExtractionController {
  constructor(
    private readonly createCategory: CreateCategoryUseCase,
    private readonly updateCategory: UpdateCategoryUseCase,
    private readonly deleteCategory: DeleteCategoryUseCase,
    private readonly getCategory: GetCategoryUseCase,
    private readonly listCategories: ListCategoriesUseCase,
    private readonly syncCategories: SyncCategoriesFromBolnaUseCase,
    private readonly createDisposition: CreateDispositionUseCase,
    private readonly updateDisposition: UpdateDispositionUseCase,
    private readonly deleteDisposition: DeleteDispositionUseCase,
    private readonly getDisposition: GetDispositionUseCase,
    private readonly listDispositions: ListDispositionsUseCase,
    private readonly syncDispositions: SyncDispositionsFromBolnaUseCase,
    private readonly listBolnaCategories: ListBolnaCategoriesUseCase,
    private readonly listBolnaDispositions: ListBolnaDispositionsUseCase,
    private readonly importExtractionsFromBolna: ImportExtractionsFromBolnaUseCase,
  ) {}

  // ── Categories ──────────────────────────────────────────────

  createCategoryHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.createCategory.execute(req.body);
      sendSuccess(res, data, HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  };

  updateCategoryHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.updateCategory.execute(
        param(req, "id"),
        req.body,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  deleteCategoryHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.deleteCategory.execute(param(req, "id"));
      sendSuccess(res, { message: "Extraction category deleted successfully" });
    } catch (err) {
      next(err);
    }
  };

  getCategoryHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.getCategory.execute(param(req, "id"));
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  listCategoriesHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.listCategories.execute(req.query as any);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  syncCategoriesHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.syncCategories.execute(
        param(req, "platformAgentId"),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  // ── Dispositions ────────────────────────────────────────────

  createDispositionHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.createDisposition.execute(req.body);
      sendSuccess(res, data, HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  };

  updateDispositionHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.updateDisposition.execute(
        param(req, "id"),
        req.body,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  deleteDispositionHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.deleteDisposition.execute(param(req, "id"));
      sendSuccess(res, {
        message: "Extraction disposition deleted successfully",
      });
    } catch (err) {
      next(err);
    }
  };

  getDispositionHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.getDisposition.execute(param(req, "id"));
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  listDispositionsHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.listDispositions.execute(req.query as any);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  syncDispositionsHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.syncDispositions.execute(
        param(req, "platformAgentId"),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  // ── Bolna Discovery & Import ───────────────────────────────

  listBolnaCategoriesHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.listBolnaCategories.execute(
        param(req, "platformAgentId"),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  listBolnaDispositionsHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const platformAgentId = req.query.platformAgentId as string | undefined;
      const data = await this.listBolnaDispositions.execute(platformAgentId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  importExtractionsFromBolnaHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.importExtractionsFromBolna.execute(req.body);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}
