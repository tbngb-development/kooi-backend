import type { PlatformAgent, IndustryPack } from "@prisma/client";
import type {
  RegisterPlatformAgentDTO,
  UpdatePlatformAgentDTO,
  ListPlatformAgentsFilters,
} from "../dto/platform-agent.dto";

export type PlatformAgentWithCount = PlatformAgent & {
  industryPack?: IndustryPack | null;
  _count: { assistants: number; extractionCategories?: number };
};

export interface PlatformAgentRepository {
  create(
    data: RegisterPlatformAgentDTO & {
      defaultConfig: any;
      systemPrompt: string | null;
    },
  ): Promise<PlatformAgent>;
  update(
    id: string,
    data: UpdatePlatformAgentDTO & {
      defaultConfig?: any;
      systemPrompt?: string | null;
    },
  ): Promise<PlatformAgent>;
  findById(id: string): Promise<PlatformAgentWithCount | null>;
  findBySlug(slug: string): Promise<PlatformAgent | null>;
  findByBolnaId(bolnaId: string): Promise<PlatformAgent | null>;
  list(filters: ListPlatformAgentsFilters): Promise<PlatformAgentWithCount[]>;
  delete(id: string): Promise<void>;
}
