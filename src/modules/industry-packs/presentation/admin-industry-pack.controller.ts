import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { param } from "../../../shared/utils/paramHelper";
import type { CreateIndustryPackUseCase } from "../application/use-cases/create-industry-pack.use-case";
import type { UpdateIndustryPackUseCase } from "../application/use-cases/update-industry-pack.use-case";
import type { DeleteIndustryPackUseCase } from "../application/use-cases/delete-industry-pack.use-case";
import type { GetIndustryPackUseCase } from "../application/use-cases/get-industry-pack.use-case";
import type { ListIndustryPacksUseCase } from "../application/use-cases/list-industry-packs.use-case";
import type { AssignAgentToPackUseCase } from "../application/use-cases/assign-agent-to-pack.use-case";
import type { RemoveAgentFromPackUseCase } from "../application/use-cases/remove-agent-from-pack.use-case";

export class AdminIndustryPackController {
  constructor(
    private readonly createPack: CreateIndustryPackUseCase,
    private readonly updatePack: UpdateIndustryPackUseCase,
    private readonly deletePack: DeleteIndustryPackUseCase,
    private readonly getPack: GetIndustryPackUseCase,
    private readonly listPacks: ListIndustryPacksUseCase,
    private readonly assignAgent: AssignAgentToPackUseCase,
    private readonly removeAgent: RemoveAgentFromPackUseCase,
  ) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.createPack.execute(req.body);
      sendSuccess(res, data, HttpStatus.CREATED);
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.updatePack.execute(param(req, "id"), req.body);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.deletePack.execute(param(req, "id"));
      sendSuccess(res, { message: "Industry pack deleted successfully" });
    } catch (err) { next(err); }
  };

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.getPack.execute(param(req, "id"));
      sendSuccess(res, data);
    } catch (err) { next(err); }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.listPacks.execute(req.query as any);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  };

  assignAgentHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const packId = param(req, "id");
      const { agentId } = req.body;
      const data = await this.assignAgent.execute(agentId, packId);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  };

  removeAgentHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.removeAgent.execute(param(req, "agentId"));
      sendSuccess(res, data);
    } catch (err) { next(err); }
  };
}