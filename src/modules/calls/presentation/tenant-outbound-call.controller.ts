// modules/calls/presentation/tenant-outbound-call.controller.ts

import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantApiKeyAuthContext } from "../../../shared/types";
import type { InitiateOutboundCallRequest } from "./outbound-call.schema";
import type { InitiateOutboundCallUseCase } from "../application/use-cases/initiate-outbound-call.use-case";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";

export class TenantOutboundCallController {
  constructor(
    private readonly initiateOutboundCallUseCase: InitiateOutboundCallUseCase,
  ) {}

  initiate = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const user = (req as AuthRequest).user as TenantApiKeyAuthContext;
      const tenantId = user.tenantId;
      const body = req.body as InitiateOutboundCallRequest;

      const data = await this.initiateOutboundCallUseCase.execute({
        tenantId,
        assistantId: body.assistantId,
        phoneNumber: body.phoneNumber,
        name: body.name,
      });

      sendSuccess(
        res,
        data,
        HttpStatus.CREATED,
        "Outbound call initiated successfully",
      );
    } catch (err) {
      next(err);
    }
  };
}
