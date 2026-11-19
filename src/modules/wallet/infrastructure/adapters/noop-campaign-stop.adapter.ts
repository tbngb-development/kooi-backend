import type {
  ICampaignStopAdapter,
  ProviderStopResult,
} from "../../application/interfaces/campaign-stop-adapter.interface";

/**
 * U-04 temporary adapter. Real Bolna/Sarvam stop actions land in U-05; this
 * reports no provider targets so the orchestrator can still record a local
 * BLOCKED incident honestly without fabricating a provider success.
 */
export class NoopCampaignStopAdapter implements ICampaignStopAdapter {
  async stop(_tenantId: string): Promise<ProviderStopResult[]> {
    return [];
  }
}
