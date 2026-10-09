import type { ClassifierRepository } from "../interfaces/classifier-repository.interface";
import { ClassifierDispositionNotFoundError } from "../../domain/errors/classifier.errors";

export class GetClassifierDispositionUseCase {
  constructor(private readonly repo: ClassifierRepository) {}

  async execute(id: string) {
    const disposition = await this.repo.getDispositionById(id);
    if (!disposition) throw new ClassifierDispositionNotFoundError(id);
    return disposition;
  }
}
