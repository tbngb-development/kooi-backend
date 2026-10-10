export interface InvitePricingResult {
  originalFee: number;
  discountPercent: number;
  discountAmount: number;
  payableAmount: number;
}

/**
 * Computes canonical pricing for tenant owner invitations and onboarding.
 *
 * Rules:
 * - If skipPayment is true (or discountPercent >= 100), the onboarding fee is 100% waived:
 *   discountAmount = originalFee, payableAmount = 0.
 * - Otherwise, discountAmount is calculated from the discount percentage and rounded to integer paisa.
 */
export function calculateInvitePricing(
  onboardingFee: number,
  discountPercent: number = 0,
  skipPayment: boolean = false,
): InvitePricingResult {
  const isWaived = skipPayment || discountPercent >= 100;
  const effectiveDiscountPercent = isWaived ? 0 : discountPercent;
  const discountAmount = isWaived
    ? onboardingFee
    : Math.round(onboardingFee * (effectiveDiscountPercent / 100));
  const payableAmount = Math.max(0, onboardingFee - discountAmount);

  return {
    originalFee: onboardingFee,
    discountPercent: effectiveDiscountPercent,
    discountAmount,
    payableAmount,
  };
}
