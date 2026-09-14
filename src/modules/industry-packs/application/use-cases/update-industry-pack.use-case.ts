import type { IndustryPackRepository } from "../interfaces/industry-pack-repository.interface";
import type { UpdateIndustryPackDTO } from "../dto/industry-pack.dto";
import {
  IndustryPackNotFoundError,
  DuplicateIndustryPackSlugError,
} from "../../domain/errors/industry-pack.errors";

export class UpdateIndustryPackUseCase {
  constructor(private readonly repository: IndustryPackRepository) {}

  async execute(id: string, dto: UpdateIndustryPackDTO) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new IndustryPackNotFoundError(id);

    if (dto.slug && dto.slug !== existing.slug) {
      const collision = await this.repository.findBySlug(dto.slug);
      if (collision) throw new DuplicateIndustryPackSlugError(dto.slug);
    }

    return this.repository.update(id, dto);
  }
}