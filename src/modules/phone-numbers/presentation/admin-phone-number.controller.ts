import type { Request, Response, NextFunction } from "express";
import type { CreatePhoneNumberUseCase } from "../application/use-cases/create-phone-number.use-case";
import type { ListPhoneNumbersUseCase } from "../application/use-cases/list-phone-numbers.use-case";
import type { GetPhoneNumberUseCase } from "../application/use-cases/get-phone-number.use-case";
import type { UpdatePhoneNumberUseCase } from "../application/use-cases/update-phone-number.use-case";
import type { AssignPhoneNumberUseCase } from "../application/use-cases/assign-phone-number.use-case";
import type { UnassignPhoneNumberUseCase } from "../application/use-cases/unassign-phone-number.use-case";
import type { DeletePhoneNumberUseCase } from "../application/use-cases/delete-phone-number.use-case";
import type { GetTenantAssistantsUseCase } from "../application/use-cases/get-tenant-assistants.use-case";

export class AdminPhoneNumberController {
  constructor(
    private readonly createPhoneNumberUseCase: CreatePhoneNumberUseCase,
    private readonly listPhoneNumbersUseCase: ListPhoneNumbersUseCase,
    private readonly getPhoneNumberUseCase: GetPhoneNumberUseCase,
    private readonly updatePhoneNumberUseCase: UpdatePhoneNumberUseCase,
    private readonly assignPhoneNumberUseCase: AssignPhoneNumberUseCase,
    private readonly unassignPhoneNumberUseCase: UnassignPhoneNumberUseCase,
    private readonly deletePhoneNumberUseCase: DeletePhoneNumberUseCase,
    private readonly getTenantAssistantsUseCase: GetTenantAssistantsUseCase,
  ) {}

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.listPhoneNumbersUseCase.execute(req.query as any);
      res.status(200).json({ success: true, data: result });
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
      const result = await this.createPhoneNumberUseCase.execute(req.body);
      res.status(201).json({
        success: true,
        message: "Phone number registered successfully",
        data: result,
      });
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
      const id = req.params.id as string;
      const result = await this.getPhoneNumberUseCase.execute(id);
      res.status(200).json({ success: true, data: result });
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
      const id = req.params.id as string;
      const result = await this.updatePhoneNumberUseCase.execute(
        id,
        req.body,
      );
      res.status(200).json({
        success: true,
        message: "Phone number updated successfully",
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  assign = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const id = req.params.id as string;
      const result = await this.assignPhoneNumberUseCase.execute(
        id,
        req.body,
      );
      res.status(200).json({
        success: true,
        message: "Phone number assigned to tenant successfully",
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  unassign = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const id = req.params.id as string;
      const result = await this.unassignPhoneNumberUseCase.execute(id);
      res.status(200).json({
        success: true,
        message: "Phone number unassigned from tenant successfully",
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  delete = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const id = req.params.id as string;
      const result = await this.deletePhoneNumberUseCase.execute(id);
      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  getTenantAssistants = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = req.params.tenantId as string;
      const assistants = await this.getTenantAssistantsUseCase.execute(
        tenantId,
      );
      res.status(200).json({ success: true, data: assistants });
    } catch (err) {
      next(err);
    }
  };
}
