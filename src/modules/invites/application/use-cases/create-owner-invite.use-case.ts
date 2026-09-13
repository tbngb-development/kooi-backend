import crypto from "crypto";
import { env } from "../../../../shared/config/env";
import type { InviteRepository } from "../interfaces/invite-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { IEmailService } from "../../../../shared/config/external/email/email.interface";
import { inviteTenantEmailHtml } from "../../../../shared/config/external/email/templates/invite-tenant.template";
import { PlanNotFoundError } from "../../../plans/domain/errors/plan.errors";
import type {
  CreateOwnerInviteInput,
  OwnerInviteResponse,
} from "../dto/invite.dto";
import { toOwnerInviteResponse } from "../mappers/invite.mapper";

const DEFAULT_EXPIRY_DAYS = 1; // ← Changed from 7 to 1

export class CreateOwnerInviteUseCase {
  constructor(
    private readonly inviteRepo: InviteRepository,
    private readonly planRepo: PlanRepository,
    private readonly email: IEmailService,
  ) {}

  async execute(input: CreateOwnerInviteInput): Promise<OwnerInviteResponse> {
    const plan = await this.planRepo.findById(input.planId);
    if (!plan || !plan.isActive) throw new PlanNotFoundError(input.planId);

    const latestVersion = await this.planRepo.findLatestPublishedVersion(
      input.planId,
    );
    if (!latestVersion) throw new PlanNotFoundError(input.planId);

    // ── Normalize payment flags (server-side truth) ──────────────
    let skipPayment = input.skipPayment ?? false;
    let discountPercent = input.discountPercent ?? 0;
    const creditIncludedBalance = input.creditIncludedBalance ?? true;

    // Discount 100% → force skip payment
    if (discountPercent >= 100) {
      skipPayment = true;
      discountPercent = 0;
    }

    // Skip payment → discount is irrelevant
    if (skipPayment) {
      discountPercent = 0;
    }

    const token = crypto.randomUUID();
    const days = input.expiryDays ?? DEFAULT_EXPIRY_DAYS;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const invite = await this.inviteRepo.create({
      email: input.email,
      tenantName: input.tenantName,
      token,
      planId: input.planId,
      invitedBy: input.invitedBy,
      expiresAt,
      skipPayment,
      discountPercent,
      creditIncludedBalance,
    });

    const inviteUrl = `${env.frontendUrl}/accept-invite/${token}`;

    // ── Compute pricing for email ────────────────────────────────
    const originalFee = latestVersion.onboardingFee;
    const discountAmount = skipPayment
      ? originalFee
      : Math.round(originalFee * (discountPercent / 100));
    const payableAmount = originalFee - discountAmount;

    await this.email.send({
      to: input.email,
      subject: `Invite to ${input.tenantName}`,
      html: inviteTenantEmailHtml({
        tenantName: input.tenantName,
        planName: plan.name,
        inviteUrl,
        expiresAt: expiresAt.toISOString(),
        onboardingFee: originalFee,
        discountPercent,
        discountAmount,
        payableAmount,
        includedBalance: latestVersion.includedBalance,
        perMinuteRate: latestVersion.perMinuteRate,
        skipPayment,
      }),
    });

    return toOwnerInviteResponse(invite, inviteUrl);
  }
}
