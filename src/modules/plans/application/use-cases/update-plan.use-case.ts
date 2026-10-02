import type { PlanRepository } from "../interfaces/plan-repository.interface";
import type { UpdatePlanInput, PlanResponse } from "../dto/plan.dto";
import { PlanNotFoundError } from "../../domain/errors/plan.errors";
import { toPlanResponse } from "../mappers/plan.mapper";

export class UpdatePlanUseCase {
  constructor(private readonly planRepo: PlanRepository) {}

  async execute(id: string, input: UpdatePlanInput): Promise<PlanResponse> {
    const existing = await this.planRepo.findById(id);
    if (!existing) throw new PlanNotFoundError(id);

    const updated = await this.planRepo.update(id, input);
    return toPlanResponse(updated);
  }
}