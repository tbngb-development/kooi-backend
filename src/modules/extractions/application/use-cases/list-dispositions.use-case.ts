import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { ListDispositionsFilters } from "../dto/extraction.dto";

export class ListDispositionsUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(filters: ListDispositionsFilters) {
    return this.repository.listDispositions(filters);
  }
}