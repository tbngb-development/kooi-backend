import type { PlanRepository } from "../interfaces/plan-repository.interface";
import type {
  CreatePlanVersionInput,
  PlanVersionResponse,
} from "../dto/plan.dto";
import { PlanNotFoundError } from "../../domain/errors/plan.errors";
import { toPlanVersionResponse } from "../mappers/plan.mapper";

export class CreatePlanVersionUseCase {
  constructor(private readonly planRepo: PlanRepository) {}

  async execute(
    planId: string,
    input: CreatePlanVersionInput,
  ): Promise<PlanVersionResponse> {
    const plan = await this.planRepo.findById(planId);
    if (!plan) throw new PlanNotFoundError(planId);

    const version = await this.planRepo.createVersion(planId, input);
    return toPlanVersionResponse(version);
  }
}
