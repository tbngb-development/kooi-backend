import type { Request, Response, NextFunction } from "express";
import type { GetTenantPhoneNumberUseCase } from "../application/use-cases/get-tenant-phone-number.use-case";
import type { ListTenantPhoneNumbersUseCase } from "../application/use-cases/list-tenant-phone-numbers.use-case";

export class TenantPhoneNumberController {
  constructor(
    private readonly getTenantPhoneNumberUseCase: GetTenantPhoneNumberUseCase,
    private readonly listTenantPhoneNumbersUseCase: ListTenantPhoneNumbersUseCase,
  ) {}

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = (req as any).user?.tenantId;
      if (!tenantId) {
        res.status(200).json({ success: true, data: [] });
        return;
      }

      const phoneNumbers =
        await this.listTenantPhoneNumbersUseCase.execute(tenantId);
      res.status(200).json({ success: true, data: phoneNumbers });
    } catch (err) {
      next(err);
    }
  };

  getAssigned = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = (req as any).user?.tenantId;
      if (!tenantId) {
        res.status(200).json({ success: true, data: null });
        return;
      }

      const assignedNumber =
        await this.getTenantPhoneNumberUseCase.execute(tenantId);
      res.status(200).json({ success: true, data: assignedNumber });
    } catch (err) {
      next(err);
    }
  };
}
