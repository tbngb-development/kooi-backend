import type { ISarvamAgentRepository } from "../../interfaces/sarvam-agent-repository.interface";
import type { SarvamAgentMapper } from "../../mappers/sarvam-agent.mapper";
import type {
  ListSarvamAgentsQueryDTO,
  SarvamAgentListResponseDTO,
} from "../../dto/sarvam-agent.dto";

export class ListSarvamAgentsUseCase {
  constructor(
    private readonly repository: ISarvamAgentRepository,
    private readonly mapper: SarvamAgentMapper,
  ) {}

  async execute(
    query: ListSarvamAgentsQueryDTO,
  ): Promise<SarvamAgentListResponseDTO> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));

    const { items, total } = await this.repository.list({
      page,
      limit,
      search: query.search?.trim(),
      apiKeyId: query.apiKeyId?.trim(),
      status: query.status,
      tenantId: query.tenantId?.trim(),
    });

    const totalPages = Math.ceil(total / limit);

    return {
      items: items.map((agent) => this.mapper.toAdminDTO(agent)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }
}

