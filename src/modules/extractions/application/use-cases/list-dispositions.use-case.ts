import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type {
  ListDispositionsFilters,
  PaginatedDispositionsResult,
} from "../dto/extraction.dto";

export class ListDispositionsUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(
    filters: ListDispositionsFilters,
  ): Promise<PaginatedDispositionsResult> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const { items, total } = await this.repository.listDispositions(filters);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}
