export interface BillableCallInput {
  durationSec: number;
  perMinuteRate: number; // in paisa
  billingMinimumSec: number;
  billingIncrementSec: number;
}

export interface CallCostBreakdown {
  billableSeconds: number;
  costPaisa: number;
}

/**
 * Calculates the cost of a call in paisa based on plan pricing rules.
 *
 * Rules:
 *  - Calls under the minimum duration are charged the minimum
 *  - Calls over the minimum are rounded up to the next increment
 *  - Cost = ceil((billableSeconds / 60) * perMinuteRate)
 */
export function calculateCallCost(input: BillableCallInput): CallCostBreakdown {
  const { durationSec, perMinuteRate, billingMinimumSec, billingIncrementSec } =
    input;

  if (durationSec <= 0) {
    return { billableSeconds: 0, costPaisa: 0 };
  }

  let billedSec: number;
  if (durationSec <= billingMinimumSec) {
    billedSec = billingMinimumSec;
  } else {
    const overflow = durationSec - billingMinimumSec;
    const incrementsNeeded = Math.ceil(
      overflow / Math.max(billingIncrementSec, 1),
    );
    billedSec = billingMinimumSec + incrementsNeeded * billingIncrementSec;
  }

  const costPaisa = Math.ceil((billedSec / 60) * perMinuteRate);
  return { billableSeconds: billedSec, costPaisa };
}
