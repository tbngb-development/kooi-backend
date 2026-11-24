import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../../shared/utils/response";
import { HttpStatus } from "../../../../shared/constants/http-status";
import { param } from "../../../../shared/utils/paramHelper";
import { ValidationError } from "../../../../shared/errors/validation.error";
import type { AuthRequest } from "../../../../shared/types";
import type { CreateSarvamAgentUseCase } from "../../application/use-cases/admin/create-sarvam-agent.use-case";
import type { UpdateSarvamAgentUseCase } from "../../application/use-cases/admin/update-sarvam-agent.use-case";
import type { GetSarvamAgentUseCase } from "../../application/use-cases/admin/get-sarvam-agent.use-case";
import type { ListSarvamAgentsUseCase } from "../../application/use-cases/admin/list-sarvam-agents.use-case";
import type { ArchiveSarvamAgentUseCase } from "../../application/use-cases/admin/archive-sarvam-agent.use-case";
import type { UploadSarvamAgentAudioUseCase } from "../../application/use-cases/admin/upload-sarvam-agent-audio.use-case";

export class AdminSarvamAgentController {
  constructor(
    private readonly createUseCase: CreateSarvamAgentUseCase,
    private readonly updateUseCase: UpdateSarvamAgentUseCase,
    private readonly getUseCase: GetSarvamAgentUseCase,
    private readonly listUseCase: ListSarvamAgentsUseCase,
    private readonly archiveUseCase: ArchiveSarvamAgentUseCase,
    private readonly uploadAudioUseCase?: UploadSarvamAgentAudioUseCase,
  ) {}

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.listUseCase.execute(req.query);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  create = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { userId } = (req as AuthRequest).user;
      const result = await this.createUseCase.execute({
        ...req.body,
        createdBy: userId,
      });
      sendSuccess(
        res,
        result,
        HttpStatus.CREATED,
        "Sarvam agent created successfully.",
      );
    } catch (err) {
      next(err);
    }
  };

  getById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const id = param(req, "id");
      const result = await this.getUseCase.execute(id);
      sendSuccess(res, result);
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
      const id = param(req, "id");
      const { userId } = (req as AuthRequest).user;
      const result = await this.updateUseCase.execute({
        id,
        ...req.body,
        updatedBy: userId,
      });
      sendSuccess(
        res,
        result,
        HttpStatus.OK,
        "Sarvam agent updated successfully.",
      );
    } catch (err) {
      next(err);
    }
  };

  archive = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const id = param(req, "id");
      const { userId } = (req as AuthRequest).user;
      const result = await this.archiveUseCase.execute(id, userId);
      sendSuccess(
        res,
        result,
        HttpStatus.OK,
        "Sarvam agent archived successfully.",
      );
    } catch (err) {
      next(err);
    }
  };

  uploadAudio = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const file = req.file;
      if (!file) {
        throw new ValidationError([
          { field: "audio", message: "No audio file provided." },
        ]);
      }

      if (!this.uploadAudioUseCase) {
        throw new Error("UploadSarvamAgentAudioUseCase is not configured.");
      }

      const result = await this.uploadAudioUseCase.execute({
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      });

      sendSuccess(
        res,
        result,
        HttpStatus.OK,
        "Audio file uploaded successfully.",
      );
    } catch (err) {
      next(err);
    }
  };
}
