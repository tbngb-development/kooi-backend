import type { TenantRole } from "@prisma/client";

export interface CreateInviteInput {
  tenantId: string;
  email: string;
  role: TenantRole;
  inviterId: string;
}

export interface CreateInviteOutput {
  inviteToken: string;
  inviteUrl: string;
  expiresAt: string;
}

export interface AcceptInviteInput {
  inviteToken: string;
  email: string;
  password: string;
  name: string;
}

export interface AcceptInviteOutput {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  user: { id: string; email: string; name: string };
  membership: {
    id: string;
    tenantId: string;
    tenantName: string;
    role: string;
  };
}

// ─── Owner Invite DTOs (UPDATED) ──────────────────────────────────────

export interface CreateOwnerInviteInput {
  email: string;
  tenantName: string;
  planId: string;
  invitedBy: string;
  expiryDays?: number;
  skipPayment?: boolean; // ← NEW
  discountPercent?: number; // ← NEW (0-100)
  creditIncludedBalance?: boolean; // ← NEW
}

export interface OwnerInviteResponse {
  id: string;
  email: string;
  tenantName: string;
  planId: string;
  planName: string;
  status: string;
  expiresAt: string;
  resendCount: number;
  inviteUrl: string;
  createdAt: string;
  skipPayment: boolean; // ← NEW
  discountPercent: number; // ← NEW
  creditIncludedBalance: boolean; // ← NEW
  payableAmount: number; // ← NEW (paisa, after discount)
}

export interface PublicInviteView {
  email: string;
  tenantName: string;
  status: string;
  expiresAt: string;
  plan: {
    id: string;
    name: string;
    slug: string;
    onboardingFee: number; // original (paisa)
    perMinuteRate: number;
    includedBalance: number;
  };
  skipPayment: boolean; // ← NEW
  discountPercent: number; // ← NEW
  discountAmount: number; // ← NEW (paisa saved)
  payableAmount: number; // ← NEW (paisa after discount)
  creditIncludedBalance: boolean; // ← NEW
  paymentRequired: boolean; // ← NEW (computed)
}

export interface AcceptOwnerInviteInput {
  token: string;
  email: string;
  name: string;
  password: string;
  termsAccepted: boolean;
  termsVersion: string;
}

export interface AcceptOwnerInviteResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  user: { id: string; email: string; name: string };
  tenant: { id: string; name: string };
  membership: { id: string; role: "OWNER" };
  paymentRequired: boolean;
  plan: {
    id: string;
    name: string;
    slug: string;
    onboardingFee: number; // effective (after discount)
    discountPercent: number; // ← NEW
    discountAmount: number; // ← NEW
    payableAmount: number; // ← NEW
  } | null;
}
