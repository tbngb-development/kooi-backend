import type { IBolnaClientFactory } from "../../../../shared/config/external/bolna/bolna-client.factory";
import type { BolnaCallPayload } from "../../../../shared/types/bolna.types";
import type { BolnaCallProvider } from "../../../calls/application/interfaces/bolna-call-provider.interface";

export class BolnaCallProviderImpl implements BolnaCallProvider {
  constructor(private readonly bolnaFactory: IBolnaClientFactory) {}

  async createCall(tenantId: string, payload: BolnaCallPayload) {
    const bolnaClient = await this.bolnaFactory.forTenant(tenantId);
    return bolnaClient.calls.create(payload);
  }
}
