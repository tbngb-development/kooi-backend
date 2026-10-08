import type { ClassifierRepository } from "../interfaces/classifier-repository.interface";
import type { ListClassifierDispositionsFilters } from "../dto/classifier.dto";

export class ListClassifierDispositionsUseCase {
  constructor(private readonly repo: ClassifierRepository) {}

  async execute(filters: ListClassifierDispositionsFilters) {
    return this.repo.listDispositions(filters);
  }
}
