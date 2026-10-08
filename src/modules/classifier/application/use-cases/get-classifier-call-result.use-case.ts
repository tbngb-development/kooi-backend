import type { ClassifierRepository } from "../interfaces/classifier-repository.interface";
import { NotFoundError } from "../../../../shared/errors/not-found.error";

export class GetClassifierCallResultUseCase {
  constructor(private readonly repo: ClassifierRepository) {}

  async execute(callId: string, tenantId?: string) {
    const result = await this.repo.getCallResult(callId);

    if (!result) throw new NotFoundError("Classifier result not found.");
    if (tenantId && result.tenantId !== tenantId) {
      throw new NotFoundError("Classifier result not found.");
    }

    return result;
  }
}
