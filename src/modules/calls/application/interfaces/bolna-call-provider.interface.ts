import type { BolnaCallPayload, BolnaCallResponse } from "../../../../shared/types/bolna.types";

export interface BolnaCallProvider {
  createCall(
    tenantId: string,
    payload: BolnaCallPayload,
  ): Promise<BolnaCallResponse>;
}
