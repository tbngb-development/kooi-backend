import type { CallRepository } from "../interfaces/call-repository.interface";
import type { ExtractionResponse } from "../../../../shared/types/bolna.types";

export class GetCallExtractionResponseUseCase {
  constructor(private readonly callRepo: CallRepository) {}

  async execute(tenantId: string, callId: string): Promise<ExtractionResponse> {
    const response = await this.callRepo.getExtractionResponse(
      tenantId,
      callId,
    );

    if (!response) {
      // Return empty structure instead of throwing — the call may exist
      // but have no extraction config (e.g., legacy real-estate calls)
      return { metrics: [], results: [] };
    }

    return response;
  }
}
