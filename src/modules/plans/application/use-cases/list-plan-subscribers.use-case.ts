import type { PlanRepository } from "../interfaces/plan-repository.interface";
import type {
  ListPlanSubscribersQuery,
  ListPlanSubscribersResponse,
} from "../dto/plan.dto";
import { PlanNotFoundError } from "../../domain/errors/plan.errors";

export class ListPlanSubscribersUseCase {
  constructor(private readonly planRepo: PlanRepository) {}

  async execute(
    query: ListPlanSubscribersQuery,
  ): Promise<ListPlanSubscribersResponse> {
    // Verify the plan exists
    const plan = await this.planRepo.findById(query.planId);
    if (!plan) throw new PlanNotFoundError(query.planId);

    return this.planRepo.listSubscribers(query);
  }
}
