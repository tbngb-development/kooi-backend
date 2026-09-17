import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { param } from "../../../shared/utils/paramHelper";

import type { RegisterPlatformAgentUseCase } from "../application/use-cases/register-platform-agent.use-case";
import type { SyncPlatformAgentUseCase } from "../application/use-cases/sync-platform-agent.use-case";
import type { UpdatePlatformAgentUseCase } from "../application/use-cases/update-platform-agent.use-case";
import type { GetPlatformAgentUseCase } from "../application/use-cases/get-platform-agent.use-case";
import type { ListPlatformAgentsUseCase } from "../application/use-cases/list-platform-agents.use-case";
import type { DeletePlatformAgentUseCase } from "../application/use-cases/delete-platform-agent.use-case";
import type { ListBolnaAgentsUseCase } from "../application/use-cases/list-bolna-agents.use-case";
import type { PreviewBolnaAgentUseCase } from "../application/use-cases/preview-bolna-agent.use-case";
import type { ImportFromBolnaUseCase } from "../application/use-cases/import-from-bolna.use-case";
import type { SyncBlueprintUseCase } from "../application/use-cases/sync-blueprint.use-case";

// Extraction assignment Use Cases
import type { AssignCategoryToAgentUseCase } from "../application/use-cases/assign-category-to-agent.use-case";
import type { RemoveCategoryFromAgentUseCase } from "../application/use-cases/remove-category-from-agent.use-case";
import type { AssignDispositionToAgentUseCase } from "../application/use-cases/assign-disposition-to-agent.use-case";
import type { RemoveDispositionFromAgentUseCase } from "../application/use-cases/remove-disposition-from-agent.use-case";
import type { GetAgentExtractionsUseCase } from "../application/use-cases/get-agent-extractions.use-case";
import type { SyncExtractionsToBolnaUseCase } from "../application/use-cases/sync-extractions-to-bolna.use-case";
import { listPlatformAgentsQuerySchema } from "./platform-agent.schema";

export class AdminPlatformAgentController {
  constructor(
    private readonly registerUseCase: RegisterPlatformAgentUseCase,
    private readonly syncUseCase: SyncPlatformAgentUseCase,
    private readonly updateUseCase: UpdatePlatformAgentUseCase,
    private readonly getUseCase: GetPlatformAgentUseCase,
    private readonly listUseCase: ListPlatformAgentsUseCase,
    private readonly deleteUseCase: DeletePlatformAgentUseCase,
    private readonly listBolnaAgentsUseCase: ListBolnaAgentsUseCase,
    private readonly previewBolnaAgentUseCase: PreviewBolnaAgentUseCase,
    private readonly importFromBolnaUseCase: ImportFromBolnaUseCase,
    private readonly syncBlueprintUseCase: SyncBlueprintUseCase,
    private readonly assignCategory: AssignCategoryToAgentUseCase,
    private readonly removeCategory: RemoveCategoryFromAgentUseCase,
    private readonly assignDisposition: AssignDispositionToAgentUseCase,
    private readonly removeDisposition: RemoveDispositionFromAgentUseCase,
    private readonly getAgentExtractions: GetAgentExtractionsUseCase,
    private readonly syncExtractionsToBolna: SyncExtractionsToBolnaUseCase,
  ) {}

  register = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.registerUseCase.execute(req.body);
      sendSuccess(res, data, HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  };

  sync = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.syncUseCase.execute(param(req, "id"));
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  update = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.updateUseCase.execute(param(req, "id"), req.body);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  get = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.getUseCase.execute(param(req, "id"));
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = listPlatformAgentsQuerySchema.parse(req.query);
      const data = await this.listUseCase.execute(query);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  remove = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.deleteUseCase.execute(param(req, "id"));
      sendSuccess(res, { message: "Platform agent deleted successfully" });
    } catch (err) {
      next(err);
    }
  };

  // ── Bolna Dynamic Discovery ────────────────────────────────────────────────

  listBolnaAgents = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const bolnaApiKeyId = req.query.bolnaApiKeyId as string | undefined;
      const data = await this.listBolnaAgentsUseCase.execute(bolnaApiKeyId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  previewBolnaAgent = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const bolnaApiKeyId = req.query.bolnaApiKeyId as string | undefined;
      const data = await this.previewBolnaAgentUseCase.execute(
        param(req, "bolnaId"),
        bolnaApiKeyId,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  importFromBolna = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.importFromBolnaUseCase.execute(req.body);
      sendSuccess(res, data, HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  };

  syncBlueprint = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.syncBlueprintUseCase.execute(param(req, "id"));
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  // ── Extractions Assignment Handlers ────────────────────────────────────────

  getAgentExtractionsHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.getAgentExtractions.execute(param(req, "id"));
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  assignCategoryHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.assignCategory.execute(param(req, "id"), req.body);
      sendSuccess(res, {
        message: "Categories assigned to agent successfully",
      });
    } catch (err) {
      next(err);
    }
  };

  removeCategoryHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.removeCategory.execute(
        param(req, "id"),
        param(req, "categoryId"),
      );
      sendSuccess(res, { message: "Category assignment removed from agent" });
    } catch (err) {
      next(err);
    }
  };

  assignDispositionHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.assignDisposition.execute(param(req, "id"), req.body);
      sendSuccess(res, {
        message: "Dispositions assigned directly to agent successfully",
      });
    } catch (err) {
      next(err);
    }
  };

  removeDispositionHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.removeDisposition.execute(
        param(req, "id"),
        param(req, "dispositionId"),
      );
      sendSuccess(res, {
        message: "Disposition direct assignment removed from agent",
      });
    } catch (err) {
      next(err);
    }
  };

  syncExtractionsToBolnaHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const report = await this.syncExtractionsToBolna.execute(
        param(req, "id"),
      );
      sendSuccess(res, report);
    } catch (err) {
      next(err);
    }
  };
}
