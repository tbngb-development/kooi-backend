import crypto from "crypto";
import { env } from "../../../../shared/config/env";
import type { InviteRepository } from "../interfaces/invite-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { IEmailService } from "../../../../shared/config/external/email/email.interface";
import { inviteTenantEmailHtml } from "../../../../shared/config/external/email/templates/invite-tenant.template";
import {
  InviteNotFoundError,
  InviteInvalidError,
} from "../../domain/errors/invite.errors";
import type { OwnerInviteResponse } from "../dto/invite.dto";
import { toOwnerInviteResponse } from "../mappers/invite.mapper";

const DEFAULT_EXPIRY_DAYS = 1; // ← Changed from 7 to 1

export class ResendOwnerInviteUseCase {
  constructor(
    private readonly inviteRepo: InviteRepository,
    private readonly planRepo: PlanRepository,
    private readonly email: IEmailService,
  ) {}

  async execute(inviteId: string): Promise<OwnerInviteResponse> {
    const invite = await this.inviteRepo.findById(inviteId);
    if (!invite) throw new InviteNotFoundError();
    if (invite.status !== "PENDING") throw new InviteInvalidError();

    const newToken = crypto.randomUUID();
    const expiresAt = new Date(
      Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    const updated = await this.inviteRepo.bumpResend(
      inviteId,
      newToken,
      expiresAt,
    );

    const inviteUrl = `${env.frontendUrl}/accept-invite/${newToken}`;

    // Compute pricing for email
    const latestVersion = await this.planRepo.findLatestPublishedVersion(
      invite.planId,
    );
    const originalFee = latestVersion?.onboardingFee ?? 0;
    const discountPercent = invite.skipPayment ? 0 : invite.discountPercent;
    const discountAmount = invite.skipPayment
      ? originalFee
      : Math.round(originalFee * (discountPercent / 100));
    const payableAmount = originalFee - discountAmount;

    await this.email.send({
      to: invite.email,
      subject: `Reminder: Invite to ${invite.tenantName}`,
      html: inviteTenantEmailHtml({
        tenantName: invite.tenantName,
        planName: invite.plan.name,
        inviteUrl,
        expiresAt: expiresAt.toISOString(),
        onboardingFee: originalFee,
        discountPercent,
        discountAmount,
        payableAmount,
        includedBalance: latestVersion?.includedBalance ?? 0,
        perMinuteRate: latestVersion?.perMinuteRate ?? 0,
        skipPayment: invite.skipPayment,
      }),
    });

    return toOwnerInviteResponse(updated, inviteUrl);
  }
}
