import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { param } from "../../../shared/utils/paramHelper";

// Use Case Imports
import type { CreateCategoryUseCase } from "../application/use-cases/create-category.use-case";
import type { UpdateCategoryUseCase } from "../application/use-cases/update-category.use-case";
import type { DeleteCategoryUseCase } from "../application/use-cases/delete-category.use-case";
import type { GetCategoryUseCase } from "../application/use-cases/get-category.use-case";
import type { ListCategoriesUseCase } from "../application/use-cases/list-categories.use-case";
import type { CreateDispositionUseCase } from "../application/use-cases/create-disposition.use-case";
import type { UpdateDispositionUseCase } from "../application/use-cases/update-disposition.use-case";
import type { DeleteDispositionUseCase } from "../application/use-cases/delete-disposition.use-case";
import type { GetDispositionUseCase } from "../application/use-cases/get-disposition.use-case";
import type { ListDispositionsUseCase } from "../application/use-cases/list-dispositions.use-case";

// M2M Use Case Imports
import type { AttachIndustriesToCategoryUseCase } from "../application/use-cases/attach-industries-to-category.use-case";
import type { DetachIndustryFromCategoryUseCase } from "../application/use-cases/detach-industry-from-category.use-case";
import type { AttachDispositionsToCategoryUseCase } from "../application/use-cases/attach-dispositions-to-category.use-case";
import type { DetachDispositionFromCategoryUseCase } from "../application/use-cases/detach-disposition-from-category.use-case";
import type { AttachIndustriesToDispositionUseCase } from "../application/use-cases/attach-industries-to-disposition.use-case";
import type { DetachIndustryFromDispositionUseCase } from "../application/use-cases/detach-industry-from-disposition.use-case";

// Discovery Use Case Imports
import type { PreviewBolnaCategoriesUseCase } from "../application/use-cases/preview-bolna-categories.use-case";
import type { PreviewBolnaDispositionsUseCase } from "../application/use-cases/preview-bolna-dispositions.use-case";

export class AdminExtractionController {
  constructor(
    private readonly createCategory: CreateCategoryUseCase,
    private readonly updateCategory: UpdateCategoryUseCase,
    private readonly deleteCategory: DeleteCategoryUseCase,
    private readonly getCategory: GetCategoryUseCase,
    private readonly listCategories: ListCategoriesUseCase,
    private readonly createDisposition: CreateDispositionUseCase,
    private readonly updateDisposition: UpdateDispositionUseCase,
    private readonly deleteDisposition: DeleteDispositionUseCase,
    private readonly getDisposition: GetDispositionUseCase,
    private readonly listDispositions: ListDispositionsUseCase,
    // M2M
    private readonly attachIndustriesToCategory: AttachIndustriesToCategoryUseCase,
    private readonly detachIndustryFromCategory: DetachIndustryFromCategoryUseCase,
    private readonly attachDispositionsToCategory: AttachDispositionsToCategoryUseCase,
    private readonly detachDispositionFromCategory: DetachDispositionFromCategoryUseCase,
    private readonly attachIndustriesToDisposition: AttachIndustriesToDispositionUseCase,
    private readonly detachIndustryFromDisposition: DetachIndustryFromDispositionUseCase,
    // Discovery
    private readonly previewBolnaCategories: PreviewBolnaCategoriesUseCase,
    private readonly previewBolnaDispositions: PreviewBolnaDispositionsUseCase,
  ) {}

  // ── Categories CRUD ────────────────────────────────────────────────────────

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

  // ── Categories M2M Associations ───────────────────────────────────────────

  attachIndustriesToCategoryHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.attachIndustriesToCategory.execute(param(req, "id"), req.body);
      sendSuccess(res, {
        message: "Industries attached to category successfully",
      });
    } catch (err) {
      next(err);
    }
  };

  detachIndustryFromCategoryHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.detachIndustryFromCategory.execute(
        param(req, "id"),
        param(req, "industryPackId"),
      );
      sendSuccess(res, {
        message: "Industry detached from category successfully",
      });
    } catch (err) {
      next(err);
    }
  };

  attachDispositionsToCategoryHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.attachDispositionsToCategory.execute(
        param(req, "id"),
        req.body,
      );
      sendSuccess(res, {
        message: "Dispositions attached to category successfully",
      });
    } catch (err) {
      next(err);
    }
  };

  detachDispositionFromCategoryHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.detachDispositionFromCategory.execute(
        param(req, "id"),
        param(req, "dispositionId"),
      );
      sendSuccess(res, {
        message: "Disposition detached from category successfully",
      });
    } catch (err) {
      next(err);
    }
  };

  // ── Dispositions CRUD ─────────────────────────────────────────────────────

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

  // ── Dispositions M2M Associations ────────────────────────────────────────

  attachIndustriesToDispositionHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.attachIndustriesToDisposition.execute(
        param(req, "id"),
        req.body,
      );
      sendSuccess(res, {
        message: "Industries attached to disposition successfully",
      });
    } catch (err) {
      next(err);
    }
  };

  detachIndustryFromDispositionHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.detachIndustryFromDisposition.execute(
        param(req, "id"),
        param(req, "industryPackId"),
      );
      sendSuccess(res, {
        message: "Industry detached from disposition successfully",
      });
    } catch (err) {
      next(err);
    }
  };

  // ── Bolna Discovery & Preview ────────────────────────────────────────────

  previewBolnaCategoriesHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.previewBolnaCategories.execute(
        req.query.agentBolnaId as string,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  previewBolnaDispositionsHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.previewBolnaDispositions.execute(
        req.query.agentBolnaId as string | undefined,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}
