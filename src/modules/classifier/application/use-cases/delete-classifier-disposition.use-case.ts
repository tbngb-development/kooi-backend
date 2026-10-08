import type { ClassifierRepository } from "../interfaces/classifier-repository.interface";
import { ClassifierDispositionNotFoundError } from "../../domain/errors/classifier.errors";

export class DeleteClassifierDispositionUseCase {
  constructor(private readonly repo: ClassifierRepository) {}

  async execute(id: string) {
    const existing = await this.repo.getDispositionById(id);
    if (!existing) throw new ClassifierDispositionNotFoundError(id);

    await this.repo.deleteDisposition(id);
  }
}
