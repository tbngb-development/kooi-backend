import {
  type CallRepository,
  type CallTranscriptResult,
} from "../interfaces/call-repository.interface";
import { CallNotFoundError } from "../../domain/errors/call.errors";

export class GetCallTranscriptUseCase {
  constructor(private readonly callRepo: CallRepository) {}

  async execute(tenantId: string, id: string): Promise<CallTranscriptResult> {
    const result = await this.callRepo.findTranscriptById(tenantId, id);
    if (!result) {
      throw new CallNotFoundError();
    }
    return result;
  }
}
