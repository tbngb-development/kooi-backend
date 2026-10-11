import type { QuickDialRepository } from "../interfaces/quick-dial-repository.interface";
import type {
  QuickDialJobDTO,
  ListQuickDialJobsFilters,
} from "../dto/quick-dial.dto";

export class ListQuickDialJobsUseCase {
  constructor(private readonly repository: QuickDialRepository) {}

  async execute(filters: ListQuickDialJobsFilters): Promise<{
    items: QuickDialJobDTO[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return this.repository.listJobs(filters);
  }
}
