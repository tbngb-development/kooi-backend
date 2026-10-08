import type { ClassifierRepository } from "../interfaces/classifier-repository.interface";
import type { CreateClassifierDispositionDTO } from "../dto/classifier.dto";
import { ClassifierDuplicateSlugError } from "../../domain/errors/classifier.errors";

export class CreateClassifierDispositionUseCase {
  constructor(private readonly repo: ClassifierRepository) {}

  async execute(data: CreateClassifierDispositionDTO) {
    const existing = await this.repo.getDispositionBySlugAndIndustry(
      data.slug,
      data.industryPackId ?? null,
    );

    if (existing) {
      throw new ClassifierDuplicateSlugError(
        data.slug,
        data.industryPackId ?? null,
      );
    }

    return this.repo.createDisposition(data);
  }
}
