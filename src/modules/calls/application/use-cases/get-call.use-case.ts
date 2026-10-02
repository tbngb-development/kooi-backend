import {
  type CallRepository,
  type DetailedCallResult,
} from "../interfaces/call-repository.interface";
import { CallNotFoundError } from "../../domain/errors/call.errors";

export class GetCallUseCase {
  constructor(private readonly callRepo: CallRepository) {}

  async execute(tenantId: string, id: string): Promise<DetailedCallResult> {
    const call = await this.callRepo.findById(tenantId, id);
    if (!call) {
      throw new CallNotFoundError();
    }
    return call;
  }
}
