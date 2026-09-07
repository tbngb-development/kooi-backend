import type {
  InviteStatus,
  TenantInvite,
  Plan,
} from "@prisma/client";

export type InviteWithPlan = TenantInvite & { plan: Plan };

export interface CreateInviteData {
  email: string;
  tenantName: string;
  token: string;
  planId: string;
  invitedBy: string;
  expiresAt: Date;
}

export interface InviteRepository {
  create(data: CreateInviteData): Promise<InviteWithPlan>;
  findById(id: string): Promise<InviteWithPlan | null>;
  findByToken(token: string): Promise<InviteWithPlan | null>;
  list(status?: InviteStatus): Promise<InviteWithPlan[]>;
  markAccepted(id: string): Promise<void>;
  markRevoked(id: string): Promise<void>;
  bumpResend(
    id: string,
    newToken: string,
    newExpiresAt: Date,
  ): Promise<InviteWithPlan>;
}
