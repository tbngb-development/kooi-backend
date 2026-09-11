import type { PlanRepository } from "../interfaces/plan-repository.interface";
import type { PlanVersionResponse } from "../dto/plan.dto";
import { PlanVersionNotFoundError } from "../../domain/errors/plan.errors";
import { toPlanVersionResponse } from "../mappers/plan.mapper";

export class ArchivePlanVersionUseCase {
  constructor(private readonly planRepo: PlanRepository) {}

  async execute(versionId: string): Promise<PlanVersionResponse> {
    const version = await this.planRepo.findVersionById(versionId);
    if (!version) throw new PlanVersionNotFoundError(versionId);

    const archived = await this.planRepo.archiveVersion(versionId);
    return toPlanVersionResponse(archived);
  }
}
