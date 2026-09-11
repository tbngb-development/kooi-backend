import type { InviteRepository } from "../interfaces/invite-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { PublicInviteView } from "../dto/invite.dto";
import {
  InviteInvalidError,
  InviteNotFoundError,
} from "../../domain/errors/invite.errors";
import { PlanNotFoundError } from "../../../plans/domain/errors/plan.errors";

export class GetOwnerInviteUseCase {
  constructor(
    private readonly inviteRepo: InviteRepository,
    private readonly planRepo: PlanRepository,
  ) {}

  async execute(token: string): Promise<PublicInviteView> {
    const invite = await this.inviteRepo.findByToken(token);
    if (!invite) throw new InviteNotFoundError();

    if (invite.status === "REVOKED" || invite.status === "ACCEPTED") {
      throw new InviteInvalidError();
    }
    if (invite.expiresAt < new Date()) {
      throw new InviteInvalidError();
    }

    let planName = "";
    let planSlug = "";
    let onboardingFee = 0;

    if (this.planRepo) {
      const plan = await this.planRepo.findById(invite.planId);
      if (!plan) throw new PlanNotFoundError(invite.planId);

      const latestVersion = await this.planRepo.findLatestPublishedVersion(
        invite.planId,
      );

      planName = plan.name;
      planSlug = plan.slug;
      onboardingFee = latestVersion?.onboardingFee ?? 0;
    } else if ((invite as any).plan) {
      const plan = (invite as any).plan;
      planName = plan.name;
      planSlug = plan.slug;

      const published =
        plan.versions?.find((v: any) => v.status === "PUBLISHED") ??
        plan.versions?.[0];

      onboardingFee = published?.onboardingFee ?? 0;
    }

    return {
      email: invite.email,
      tenantName: invite.tenantName,
      plan: {
        id: invite.planId,
        name: planName,
        slug: planSlug,
        onboardingFee,
      },
      expiresAt: invite.expiresAt.toISOString(),
      status: invite.status,
    };
  }
}
