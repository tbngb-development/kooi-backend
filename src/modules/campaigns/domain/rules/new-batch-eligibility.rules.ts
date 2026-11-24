import type { CampaignStatus, VoiceProvider } from "@prisma/client";

export type NewBatchEligibilityReason =
  | "CANCELLED"
  | "ENDED"
  | "LOW_BALANCE";

export type NewBatchEligibility =
  | { allowed: true; needsReopen: boolean }
  | { allowed: false; reason: NewBatchEligibilityReason };

export interface NewBatchEligibilityInput {
  status: CampaignStatus;
  provider?: VoiceProvider | string | null;
  endTimestamp?: Date | string | null;
  sarvamStatus?: string | null;
  hasLowBalanceLeads: boolean;
  now?: Date;
}

/**
 * Pure policy for accepting explicit user work (a new batch, run, schedule,
 * resume, or retry) on an existing campaign.
 *
 * Normal terminal campaigns (COMPLETED / FAILED) may be reopened exactly once
 * by the caller, using the atomic repository guard. CANCELLED, expired/ended
 * Sarvam campaigns, and campaigns stopped by credit enforcement stay terminal.
 * PAUSED is deliberately allowed to accept new work — only finalizers are
 * forbidden from resurrecting a terminal campaign.
 */
export function evaluateNewBatchEligibility(
  input: NewBatchEligibilityInput,
): NewBatchEligibility {
  if (input.hasLowBalanceLeads) {
    return { allowed: false, reason: "LOW_BALANCE" };
  }

  const provider =
    typeof input.provider === "string"
      ? input.provider.toUpperCase()
      : input.provider;
  const now = input.now ?? new Date();
  const endTimestamp = input.endTimestamp
    ? new Date(input.endTimestamp)
    : null;
  const isSarvam = provider === "SARVAM";
  const isEnded =
    isSarvam &&
    ((endTimestamp !== null && endTimestamp.getTime() <= now.getTime()) ||
      input.sarvamStatus?.toLowerCase() === "ended");

  if (isEnded) {
    return { allowed: false, reason: "ENDED" };
  }

  if (input.status === "CANCELLED") {
    return { allowed: false, reason: "CANCELLED" };
  }

  if (input.status === "COMPLETED" || input.status === "FAILED") {
    return { allowed: true, needsReopen: true };
  }

  return { allowed: true, needsReopen: false };
}
