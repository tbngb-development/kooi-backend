import type { InvitationStatus, TenantRole } from "@prisma/client";

/** Persisted invitation shape (never contains a raw token). */
export interface InvitationRecord {
  id: string;
  tenantId: string;
  email: string;
  role: TenantRole;
  tokenHash: string;
  status: InvitationStatus;
  invitedById: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  acceptedByUserId: string | null;
  revokedAt: Date | null;
  lastSentAt: Date | null;
  sendCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInvitationInput {
  tenantId: string;
  email: string;
  role: TenantRole;
  /** SHA-256 hash of the raw token. The raw token is never persisted. */
  tokenHash: string;
  invitedById: string;
  expiresAt: Date;
}
