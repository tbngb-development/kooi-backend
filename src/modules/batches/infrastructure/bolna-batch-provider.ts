import type { BolnaBatchProvider } from "../application/interfaces/bolna-batch-provider.interface";
import type { IBolnaClientFactory } from "../../../shared/config/external/bolna/bolna-client.factory";
import type { CreateBatchParams } from "../../../shared/config/external/bolna/bolna.client";

export class BolnaBatchProviderImpl implements BolnaBatchProvider {
  constructor(private readonly bolnaFactory: IBolnaClientFactory) {}

  async createBatch(tenantId: string, params: CreateBatchParams) {
    const bolnaClient = await this.bolnaFactory.forTenant(tenantId);
    return bolnaClient.batches.create(params);
  }

  async scheduleBatch(
    tenantId: string,
    bolnaBatchId: string,
    scheduledAt: string,
  ) {
    const bolnaClient = await this.bolnaFactory.forTenant(tenantId);
    return bolnaClient.batches.schedule(bolnaBatchId, scheduledAt);
  }

  async stopBatch(tenantId: string, bolnaBatchId: string) {
    const bolnaClient = await this.bolnaFactory.forTenant(tenantId);
    return bolnaClient.batches.stop(bolnaBatchId);
  }

  async getBatchStatus(tenantId: string, bolnaBatchId: string) {
    const bolnaClient = await this.bolnaFactory.forTenant(tenantId);
    return bolnaClient.batches.get(bolnaBatchId);
  }

  async getBatchExecutions(tenantId: string, bolnaBatchId: string) {
    const bolnaClient = await this.bolnaFactory.forTenant(tenantId);
    return bolnaClient.batches.getExecutions(bolnaBatchId);
  }

  async deleteBatch(tenantId: string, bolnaBatchId: string) {
    const bolnaClient = await this.bolnaFactory.forTenant(tenantId);
    return bolnaClient.batches.delete(bolnaBatchId);
  }
}
