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
      const data = await this.listUseCase.execute(req.query as any);
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

  // ── Bolna Discovery ────────────────────────────────────────

  listBolnaAgents = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.listBolnaAgentsUseCase.execute();
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
      const data = await this.previewBolnaAgentUseCase.execute(
        param(req, "bolnaId"),
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
}
