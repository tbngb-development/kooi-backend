import type { QuickDialRepository } from "../interfaces/quick-dial-repository.interface";
import type { QuickDialJobDTO } from "../dto/quick-dial.dto";
import { QuickDialJobNotFoundError } from "../../domain/errors/quick-dial.errors";

export class GetQuickDialJobUseCase {
  constructor(private readonly repository: QuickDialRepository) {}

  async execute(tenantId: string, jobId: string): Promise<QuickDialJobDTO> {
    const job = await this.repository.findById(tenantId, jobId);
    if (!job) {
      throw new QuickDialJobNotFoundError(jobId);
    }
    return job;
  }
}
