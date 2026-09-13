import { env } from "../../../../shared/config/env";
import type { InviteWithPlan } from "../interfaces/invite-repository.interface";
import type { OwnerInviteResponse } from "../dto/invite.dto";

export function toOwnerInviteResponse(
  invite: InviteWithPlan,
  inviteUrl?: string,
): OwnerInviteResponse {
  const url = inviteUrl ?? `${env.frontendUrl}/accept-invite/${invite.token}`;

  // Compute payable amount from stored discount
  // Note: for accurate payable we'd need the PlanVersion, but for the admin
  // list view we use the invite's discountPercent against the plan's current
  // published version. For simplicity in the list, we store the discount and
  // let the detail view (GET /:token) compute exact amounts from the version.
  // Here we return the discount metadata; payableAmount requires version lookup.
  const payableAmount = 0; // placeholder — admin list doesn't need exact paisa

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
    skipPayment: invite.skipPayment,
    discountPercent: invite.discountPercent,
    creditIncludedBalance: invite.creditIncludedBalance,
    payableAmount,
  };
}
