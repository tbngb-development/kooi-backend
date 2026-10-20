import type { Request, Response, NextFunction } from "express";
import type { GetTenantPhoneNumberUseCase } from "../application/use-cases/get-tenant-phone-number.use-case";

export class TenantPhoneNumberController {
  constructor(
    private readonly getTenantPhoneNumberUseCase: GetTenantPhoneNumberUseCase,
  ) {}

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
