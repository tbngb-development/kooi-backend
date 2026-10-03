// modules/calls/application/use-cases/archive-call.use-case.ts

import type { CallRepository } from "../interfaces/call-repository.interface";
import {
  CallNotFoundError,
  CallAlreadyDeletedError,
} from "../../domain/errors/call.errors";

export class ArchiveCallUseCase {
  constructor(private readonly callRepo: CallRepository) {}

  async execute(tenantId: string, callId: string): Promise<void> {
    const call = await this.callRepo.findById(tenantId, callId, {
      includeDeleted: true,
    });

    if (!call) {
      throw new CallNotFoundError();
    }

    if (call.isDeleted) {
      throw new CallAlreadyDeletedError();
    }

    await this.callRepo.softDelete(callId);
  }
}