import type { IndustryPackRepository } from "../interfaces/industry-pack-repository.interface";
import type { CreateIndustryPackDTO } from "../dto/industry-pack.dto";
import {
  DuplicateIndustryPackSlugError,
  DuplicateIndustryPackIndustryError,
} from "../../domain/errors/industry-pack.errors";

export class CreateIndustryPackUseCase {
  constructor(private readonly repository: IndustryPackRepository) {}

  async execute(dto: CreateIndustryPackDTO) {
    const existingSlug = await this.repository.findBySlug(dto.slug);
    if (existingSlug) throw new DuplicateIndustryPackSlugError(dto.slug);

    const existingIndustry = await this.repository.findByIndustry(dto.industry);
    if (existingIndustry) throw new DuplicateIndustryPackIndustryError(dto.industry);

    return this.repository.create(dto);
  }
}