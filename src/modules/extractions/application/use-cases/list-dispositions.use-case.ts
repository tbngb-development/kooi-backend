import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { ListDispositionsFilters } from "../dto/extraction.dto";
import type { ExtractionDisposition } from "@prisma/client";

export class ListDispositionsUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(
    filters: ListDispositionsFilters,
  ): Promise<ExtractionDisposition[]> {
    console.log("list disposition Query: ", filters)
    return this.repository.listDispositions(filters);
  }
}