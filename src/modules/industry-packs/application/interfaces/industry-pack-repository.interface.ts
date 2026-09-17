import type { IndustryPack, PlatformAgent } from "@prisma/client";
import type {
  CreateIndustryPackDTO,
  UpdateIndustryPackDTO,
  ListIndustryPacksFilters,
} from "../dto/industry-pack.dto";

export type IndustryPackWithCount = IndustryPack & {
  _count: { platformAgents: number };
};

export type IndustryPackFull = IndustryPack & {
  platformAgents: (PlatformAgent & {
    _count: { assistants: number; categories: number };
  })[];
};

export interface IndustryPackRepository {
  create(data: CreateIndustryPackDTO): Promise<IndustryPack>;
  update(id: string, data: UpdateIndustryPackDTO): Promise<IndustryPack>;
  findById(id: string): Promise<IndustryPackWithCount | null>;
  findByIdFull(id: string): Promise<IndustryPackFull | null>;
  findBySlug(slug: string): Promise<IndustryPack | null>;
  findByNameInsensitive(name: string): Promise<IndustryPack | null>;
  list(filters: ListIndustryPacksFilters): Promise<IndustryPackWithCount[]>;
  delete(id: string): Promise<void>;
  countAgentsInPack(packId: string): Promise<number>;
  assignAgentToPack(agentId: string, packId: string): Promise<void>;
  removeAgentFromPack(agentId: string): Promise<void>;
}