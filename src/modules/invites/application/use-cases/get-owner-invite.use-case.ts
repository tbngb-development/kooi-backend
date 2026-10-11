import type { InviteRepository } from "../interfaces/invite-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import { InviteNotFoundError } from "../../domain/errors/invite.errors";
import type { PublicInviteView } from "../dto/invite.dto";
import { calculateInvitePricing } from "../../domain/rules/invite-pricing.rules";

export class GetOwnerInviteUseCase {
  constructor(
    private readonly inviteRepo: InviteRepository,
    private readonly planRepo: PlanRepository,
  ) {}

  async execute(token: string): Promise<PublicInviteView> {
    const invite = await this.inviteRepo.findByToken(token);
    if (!invite) throw new InviteNotFoundError();

    // Resolve the published version for accurate pricing
    const latestVersion = await this.planRepo.findLatestPublishedVersion(
      invite.planId,
    );

    const originalFee = latestVersion?.onboardingFee ?? 0;
    const perMinuteRate = latestVersion?.perMinuteRate ?? 0;
    const includedBalance = latestVersion?.includedBalance ?? 0;

    // Compute discount
    const pricing = calculateInvitePricing(
      originalFee,
      invite.discountPercent,
      invite.skipPayment,
    );
    const paymentRequired = !invite.skipPayment && pricing.payableAmount > 0;

    return {
      email: invite.email,
      tenantName: invite.tenantName,
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString(),
      plan: {
        id: invite.planId,
        name: invite.plan.name,
        slug: invite.plan.slug,
        onboardingFee: originalFee,
        perMinuteRate,
        includedBalance,
      },
      skipPayment: invite.skipPayment,
      discountPercent: pricing.discountPercent,
      discountAmount: pricing.discountAmount,
      payableAmount: pricing.payableAmount,
      creditIncludedBalance: invite.creditIncludedBalance,
      paymentRequired,
    };
  }
}
