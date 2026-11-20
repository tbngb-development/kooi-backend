import type { Prisma } from "@prisma/client";

/**
 * Row guard shared by every campaign finalizer. Placed inside the UPDATE
 * statement so a stale reader can never overwrite a campaign that was
 * finalized concurrently by credit enforcement, a manual cancel, or another
 * webhook.
 *
 * - Only active campaigns may be finalized. COMPLETED, FAILED, CANCELLED and
 *   PAUSED campaigns are left untouched.
 * - An expired Sarvam campaign is left untouched.
 * - A credit-enforcement stop is durable: any lead marked LOW_BALANCE keeps
 *   the campaign terminal even after the tenant recharges.
 */
export function activeCampaignGuard(
  now: Date = new Date(),
  options: { allowLowBalanceMarked?: boolean } = {},
): Prisma.CampaignWhereInput {
  return {
    status: { in: ["DRAFT", "SCHEDULED", "RUNNING"] },
    OR: [
      { provider: { not: "SARVAM" } },
      { endTimestamp: null },
      { endTimestamp: { gt: now } },
    ],
    // The credit-enforcement finalizer writes the marker itself immediately
    // before finalizing, so it must be allowed to see marked campaigns.
    ...(options.allowLowBalanceMarked
      ? {}
      : { leads: { none: { stoppedReason: "LOW_BALANCE" } } }),
  };
}
