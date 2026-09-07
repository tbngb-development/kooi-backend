import type { Plan } from "@prisma/client";
import type { PlanRepository } from "../interfaces/plan-repository.interface";
import type { PlanResponse } from "../dto/plan.dto";
import { toPlanResponse } from "../mappers/plan.mapper";

export class ListPlansUseCase {
  constructor(private readonly planRepo: PlanRepository) {}

  async execute(
    options: { includeInactive?: boolean } = {},
  ): Promise<PlanResponse[]> {
    const plans: Plan[] = options.includeInactive
      ? await this.planRepo.listAll()
      : await this.planRepo.listActive();

    return plans.map(toPlanResponse);
  }
}
