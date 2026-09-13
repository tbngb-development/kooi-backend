import type { InviteRepository } from "../interfaces/invite-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import { InviteNotFoundError } from "../../domain/errors/invite.errors";
import type { PublicInviteView } from "../dto/invite.dto";

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
    const discountPercent = invite.skipPayment ? 0 : invite.discountPercent;
    const discountAmount = invite.skipPayment
      ? originalFee
      : Math.round(originalFee * (discountPercent / 100));
    const payableAmount = originalFee - discountAmount;
    const paymentRequired = !invite.skipPayment && payableAmount > 0;

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
      discountPercent,
      discountAmount,
      payableAmount,
      creditIncludedBalance: invite.creditIncludedBalance,
      paymentRequired,
    };
  }
}
