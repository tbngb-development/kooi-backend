import type { InvitationStatus, TenantRole } from "@prisma/client";
import type {
  CreateInvitationInput,
  InvitationRecord,
} from "../dto/invitation.dto";
import type {
  SeatLockContext,
  TenantMembershipRepository,
} from "./tenant-membership.repository";

/** Human-readable context needed by the public preview endpoint. */
export interface InvitationPreviewContext {
  tenantName: string;
  tenantIsActive: boolean;
  inviterName: string;
}

/** Input for creating the global User of a new invitee. */
export interface CreateInvitedUserInput {
  email: string;
  name: string;
  passwordHash: string;
}

/**
 * All invitation/accept persistence operations that must run under the tenant
 * row lock. A capacity check and the write it authorises share this context so
 * concurrent requests cannot both observe a free seat or a usable token.
 */
export interface InvitationLockContext extends SeatLockContext {
  findPendingByEmail(email: string): Promise<InvitationRecord | null>;
  findByTokenHash(tokenHash: string): Promise<InvitationRecord | null>;
  findById(id: string): Promise<InvitationRecord | null>;
  create(input: CreateInvitationInput): Promise<InvitationRecord>;
  rotateToken(
    id: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<InvitationRecord>;
  markRevoked(id: string): Promise<void>;
  markAccepted(id: string, userId: string): Promise<void>;
  findUserByEmail(email: string): Promise<{
    id: string;
    email: string;
    isActive: boolean;
  } | null>;
  createUser(input: CreateInvitedUserInput): Promise<{ id: string; email: string }>;
  insertMembership(input: {
    userId: string;
    role: TenantRole;
  }): Promise<{ id: string }>;
  membershipExists(userId: string, tenantId: string): Promise<boolean>;
  isTenantActive(): Promise<boolean>;
}

/**
 * Persistence port for team invitations.
 *
 * Extends the membership port because invitation creation and acceptance both
 * run capacity checks under the same tenant row lock. A single Prisma
 * implementation satisfies both interfaces.
 */
export interface InvitationRepository extends TenantMembershipRepository {
  withInvitationLock<T>(
    tenantId: string,
    work: (ctx: InvitationLockContext) => Promise<T>,
  ): Promise<T>;
  create(input: CreateInvitationInput): Promise<InvitationRecord>;
  findById(id: string): Promise<InvitationRecord | null>;
  findByTokenHash(tokenHash: string): Promise<InvitationRecord | null>;
  findPendingByEmail(
    tenantId: string,
    email: string,
  ): Promise<InvitationRecord | null>;
  listByTenant(
    tenantId: string,
    status?: InvitationStatus,
  ): Promise<InvitationRecord[]>;
  markAccepted(id: string, userId: string): Promise<void>;
  markRevoked(id: string): Promise<void>;
  markExpired(id: string): Promise<void>;
  touchSent(id: string): Promise<void>;
  rotateToken(
    id: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<InvitationRecord>;
  findPreviewContext(
    invitationId: string,
  ): Promise<InvitationPreviewContext | null>;
  expireStale(now: Date): Promise<number>;
}
