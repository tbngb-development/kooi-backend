import type { IndustryPackRepository } from "../interfaces/industry-pack-repository.interface";
import { IndustryPackNotFoundError } from "../../domain/errors/industry-pack.errors";

export class GetIndustryPackUseCase {
  constructor(private readonly repository: IndustryPackRepository) {}

  async execute(id: string) {
    const pack = await this.repository.findByIdFull(id);
    if (!pack) throw new IndustryPackNotFoundError(id);
    return pack;
  }
}
