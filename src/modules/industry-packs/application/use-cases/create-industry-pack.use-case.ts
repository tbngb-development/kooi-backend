import type { IndustryPackRepository } from "../interfaces/industry-pack-repository.interface";
import type { CreateIndustryPackDTO } from "../dto/industry-pack.dto";
import {
  DuplicateIndustryPackSlugError,
  DuplicateIndustryPackNameError,
} from "../../domain/errors/industry-pack.errors";

export class CreateIndustryPackUseCase {
  constructor(private readonly repository: IndustryPackRepository) {}

  async execute(dto: CreateIndustryPackDTO) {
    const existingSlug = await this.repository.findBySlug(dto.slug);
    if (existingSlug) {
      throw new DuplicateIndustryPackSlugError(dto.slug);
    }

    const existingName = await this.repository.findByNameInsensitive(dto.name);
    if (existingName) {
      throw new DuplicateIndustryPackNameError(dto.name);
    }

    return this.repository.create(dto);
  }
}