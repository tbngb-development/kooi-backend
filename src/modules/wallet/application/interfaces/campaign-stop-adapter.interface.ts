export interface ProviderStopTarget {
  provider: "BOLNA" | "SARVAM" | string;
  kind?: "BATCH" | "CAMPAIGN" | string;
  targetId: string;
}

export interface ProviderStopResult {
  target: ProviderStopTarget;
  success: boolean;
  /** Provider error message when success is false; null on success. */
  error: string | null;
}

/**
 * U-04/U-05: provider-facing stop actions. Implementations must be honest:
 * a provider failure is reported as success=false, never as a silent success.
 */
export interface ICampaignStopAdapter {
  stop(tenantId: string): Promise<ProviderStopResult[]>;
}
