import type { ClassifierRepository } from "../interfaces/classifier-repository.interface";
import type { UpdateClassifierDispositionDTO } from "../dto/classifier.dto";
import { ClassifierDispositionNotFoundError } from "../../domain/errors/classifier.errors";

export class UpdateClassifierDispositionUseCase {
  constructor(private readonly repo: ClassifierRepository) {}

  async execute(id: string, data: UpdateClassifierDispositionDTO) {
    const existing = await this.repo.getDispositionById(id);
    if (!existing) throw new ClassifierDispositionNotFoundError(id);

    return this.repo.updateDisposition(id, data);
  }
}
