import { env } from "../../../../shared/config/env";
import type { InviteWithPlan } from "../interfaces/invite-repository.interface";
import type { OwnerInviteResponse } from "../dto/invite.dto";

export function toOwnerInviteResponse(
  invite: InviteWithPlan,
  inviteUrl?: string,
): OwnerInviteResponse {
  const url = inviteUrl ?? `${env.frontendUrl}/accept-invite/${invite.token}`;

  return {
    id: invite.id,
    email: invite.email,
    tenantName: invite.tenantName,
    planId: invite.planId,
    planName: invite.plan.name,
    status: invite.status,
    expiresAt: invite.expiresAt.toISOString(),
    resendCount: invite.resendCount,
    inviteUrl: url,
    createdAt: invite.createdAt.toISOString(),
  };
}
