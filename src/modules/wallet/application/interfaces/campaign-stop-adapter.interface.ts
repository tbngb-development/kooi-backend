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
  /**
   * Local DB stops run first, then remote provider stops. `retryTargets` are
   * previously failed remote targets that must be re-attempted even when their
   * local batch/campaign is already STOPPED; they are passed back from the
   * persisted incident state on every retry.
   */
  stop(
    tenantId: string,
    retryTargets?: ProviderStopTarget[],
  ): Promise<ProviderStopResult[]>;
}
