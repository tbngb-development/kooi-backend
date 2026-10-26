// src/modules/calls/application/use-cases/re-evaluate-classifier.use-case.ts

import type { CallRepository } from "../interfaces/call-repository.interface";
import type { ProcessClassifierExtractionUseCase } from "../../../classifier/application/use-cases/process-classifier-extraction.use-case";
import type { ClassifierRepository } from "../../../classifier/application/interfaces/classifier-repository.interface";
import type { ClassifierCallResult } from "@prisma/client";
import { CallNotFoundError } from "../../domain/errors/call.errors";
import { TenantBadRequestError } from "../../../tenants/domain/tenant.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class ReEvaluateClassifierUseCase {
  constructor(
    private readonly callRepo: CallRepository,
    private readonly processClassifierExtraction: ProcessClassifierExtractionUseCase,
    private readonly classifierRepo: ClassifierRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(tenantId: string, callId: string): Promise<ClassifierCallResult | null> {
    const call = await this.callRepo.findById(tenantId, callId);
    if (!call) {
      throw new CallNotFoundError();
    }

    if (!call.transcript || call.transcript.trim().length === 0) {
      throw new TenantBadRequestError("Call has no transcript available for classification");
    }

    this.logger?.info("Triggering administrative classifier re-evaluation", {
      action: "admin.call.re_evaluate_classifier",
      tenantId,
      callId,
    });

    await this.processClassifierExtraction.execute(callId, tenantId);

    const updatedResult = await this.classifierRepo.getCallResult(callId);
    return updatedResult;
  }
}
