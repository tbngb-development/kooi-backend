import type { Request, Response, NextFunction } from "express";
import type { InboundCallerMatchUseCase } from "../application/use-cases/inbound-caller-match.use-case";

export class InboundCallerMatchController {
  constructor(
    private readonly inboundCallerMatchUseCase: InboundCallerMatchUseCase,
  ) {}

  match = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const contactNumber = (req.query.contact_number as string) ?? "";
      const agentId = (req.query.agent_id as string) ?? "";
      const executionId = (req.query.execution_id as string) ?? "";

      const data = await this.inboundCallerMatchUseCase.execute({
        contactNumber,
        agentId,
        executionId,
      });

      // Bolna expects a flat JSON object — send directly, not wrapped
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  };
}
