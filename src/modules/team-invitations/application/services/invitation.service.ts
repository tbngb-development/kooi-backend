import type { InvitationStatus, TenantRole } from "@prisma/client";
import type { InvitationRepository } from "../interfaces/invitation.repository";
import type { InvitationTokenService } from "../interfaces/invitation-token.service";
import type { InvitationRecord } from "../dto/invitation.dto";
import type { TenantMembershipService } from "./tenant-membership.service";
import type { PasswordService } from "../../../auth/application/interfaces/password-service.interface";
import type { AuthRepository } from "../../../auth/application/interfaces/auth-repository.interface";
import type { SelectTenantUseCase } from "../../../auth/application/use-cases/select-tenant.use-case";
import type { SelectTenantOutput } from "../../../auth/application/dto/select-tenant.dto";
import type { Logger } from "../../../../shared/logging/logger.interface";
import {
  getInviteInvalidReason,
  maskEmail,
  normalizeInviteEmail,
} from "../../domain/rules/invitation.rules";
import {
  AccountExistsError,
  AlreadyMemberError,
  EmailMismatchError,
  InviteInvalidError,
  InviteNotPendingError,
  InviteExpiredError,
  TenantSuspendedError,
  UserInactiveError,
} from "../../domain/errors/invitation.errors";

const DEFAULT_EXPIRY_DAYS = 7;

export interface InviteInput {
  tenantId: string;
  inviterId: string;
  inviterRole: TenantRole;
  email: string;
  role: TenantRole;
}

export interface InviteSummary {
  id: string;
  tenantId: string;
  email: string;
  role: TenantRole;
  status: InvitationStatus;
  expiresAt: Date;
  lastSentAt: Date | null;
  sendCount: number;
  createdAt: Date;
}

export interface CreateOrResendResult {
  invitation: InviteSummary;
  resent: boolean;
}

export interface ListInvitesInput {
  tenantId: string;
  status?: InvitationStatus;
}

export interface PreviewResult {
  tenantName: string;
  inviterName: string;
  role: TenantRole;
  /** Masked to reduce leakage if the invite link is forwarded. */
  email: string;
  expiresAt: Date;
  accountExists: boolean;
}

export interface AcceptNewUserInput {
  token: string;
  name: string;
  password: string;
}

export interface AcceptExistingUserInput {
  token: string;
  user: { id: string; email: string; isActive: boolean };
}

export interface AcceptResult {
  invitationId: string;
  tenantId: string;
  role: TenantRole;
  session: SelectTenantOutput;
}

export interface InvitationServiceDeps {
  repository: InvitationRepository;
  membershipService: TenantMembershipService;
  tokenService: InvitationTokenService;
  passwordService: PasswordService;
  /** Existing auth use case; no token logic is duplicated here. */
  sessionIssuer: Pick<SelectTenantUseCase, "execute">;
  authRepository: Pick<AuthRepository, "findUserByEmail" | "checkMembershipExists">;
  logger: Logger;
  now?: () => Date;
  expiryDays?: number;
}

interface AcceptedInvite {
  userId: string;
  tenantId: string;
  membershipId: string;
  role: TenantRole;
  invitationId: string;
}

/**
 * Full team-invitation lifecycle.
 *
 * Every capacity check and the write it authorises run inside the tenant row
 * lock provided by the repository. The raw token is never persisted or logged;
 * only its SHA-256 digest is used for lookup.
 */
export class InvitationService {
  private readonly now: () => Date;
  private readonly expiryDays: number;

  constructor(private readonly deps: InvitationServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.expiryDays = deps.expiryDays ?? DEFAULT_EXPIRY_DAYS;
  }

  async createOrResend(input: InviteInput): Promise<CreateOrResendResult> {
    const email = normalizeInviteEmail(input.email);
    const rawToken = this.deps.tokenService.generate();
    const tokenHash = this.deps.tokenService.hash(rawToken);
    const expiresAt = this.expiryDate();

    await this.assertEmailNotMember(input.tenantId, email);

    const result = await this.deps.repository.withInvitationLock(
      input.tenantId,
      async (ctx) => {
        if (!(await ctx.isTenantActive())) throw new TenantSuspendedError();

        await this.deps.membershipService.assertCanInviteInContext(
          ctx,
          input.tenantId,
          input.inviterRole,
          input.role,
        );

        const pending = await ctx.findPendingByEmail(email);
        if (pending) {
          const invitation = await ctx.rotateToken(pending.id, tokenHash, expiresAt);
          return { invitation, resent: true };
        }

        const invitation = await ctx.create({
          tenantId: input.tenantId,
          email,
          role: input.role,
          tokenHash,
          invitedById: input.inviterId,
          expiresAt,
        });
        return { invitation, resent: false };
      },
    );

    this.deps.logger.info(
      result.resent ? "Team invitation resent" : "Team invitation created",
      {
        action: result.resent ? "invitation.resend" : "invitation.create",
        invitationId: result.invitation.id,
        tenantId: input.tenantId,
        userId: input.inviterId,
      },
    );

    return { invitation: toSummary(result.invitation), resent: result.resent };
  }

  async list(input: ListInvitesInput): Promise<InviteSummary[]> {
    const invitations = await this.deps.repository.listByTenant(
      input.tenantId,
      input.status,
    );
    return invitations.map(toSummary);
  }

  async revoke(tenantId: string, invitationId: string): Promise<InviteSummary> {
    const invitation = await this.deps.repository.withInvitationLock(
      tenantId,
      async (ctx) => {
        const found = await this.requireInvite(ctx.findById(invitationId), tenantId);
        this.requirePending(found);
        await ctx.markRevoked(found.id);
        return found;
      },
    );

    this.deps.logger.info("Team invitation revoked", {
      action: "invitation.revoke",
      invitationId,
      tenantId,
    });
    return toSummary(invitation);
  }

  async resend(tenantId: string, invitationId: string): Promise<CreateOrResendResult> {
    const rawToken = this.deps.tokenService.generate();
    const tokenHash = this.deps.tokenService.hash(rawToken);
    const expiresAt = this.expiryDate();

    const invitation = await this.deps.repository.withInvitationLock(
      tenantId,
      async (ctx) => {
        const found = await this.requireInvite(ctx.findById(invitationId), tenantId);
        this.requirePending(found);
        return ctx.rotateToken(found.id, tokenHash, expiresAt);
      },
    );

    this.deps.logger.info("Team invitation resent", {
      action: "invitation.resend",
      invitationId,
      tenantId,
    });
    return { invitation: toSummary(invitation), resent: true };
  }

  async preview(token: string): Promise<PreviewResult> {
    const invitation = await this.findByToken(token);
    this.assertUsable(invitation);

    const [context, existingUser] = await Promise.all([
      this.deps.repository.findPreviewContext(invitation.id),
      this.deps.authRepository.findUserByEmail(invitation.email),
    ]);
    if (!context) throw new InviteInvalidError();

    // The masked local part is derived from the stored invite email, never
    // from a client-supplied value.
    const masked = maskEmail(invitation.email);

    return {
      tenantName: context.tenantName,
      inviterName: context.inviterName,
      role: invitation.role,
      email: masked,
      expiresAt: invitation.expiresAt,
      accountExists: existingUser !== null,
    };
  }

  async acceptNewUser(input: AcceptNewUserInput): Promise<AcceptResult> {
    const tokenHash = this.deps.tokenService.hash(input.token);
    const initial = await this.findByTokenHash(tokenHash);
    const passwordHash = await this.deps.passwordService.hash(input.password);

    const accepted = await this.deps.repository.withInvitationLock(
      initial.tenantId,
      async (ctx) => {
        const invitation = await this.requireUsableToken(ctx.findByTokenHash(tokenHash));

        if (!(await ctx.isTenantActive())) throw new TenantSuspendedError();
        await this.deps.membershipService.assertCanAcceptInContext(
          ctx,
          invitation.tenantId,
        );

        const existing = await ctx.findUserByEmail(invitation.email);
        if (existing) throw new AccountExistsError();

        const user = await ctx.createUser({
          email: invitation.email,
          name: input.name,
          passwordHash,
        });
        const membership = await ctx.insertMembership({
          userId: user.id,
          role: invitation.role,
        });
        await ctx.markAccepted(invitation.id, user.id);

        return {
          userId: user.id,
          tenantId: invitation.tenantId,
          membershipId: membership.id,
          role: invitation.role,
          invitationId: invitation.id,
        };
      },
    );

    return this.finishAccept(accepted);
  }

  async acceptExistingUser(input: AcceptExistingUserInput): Promise<AcceptResult> {
    const tokenHash = this.deps.tokenService.hash(input.token);
    const initial = await this.findByTokenHash(tokenHash);

    const accepted = await this.deps.repository.withInvitationLock(
      initial.tenantId,
      async (ctx) => {
        const invitation = await this.requireUsableToken(ctx.findByTokenHash(tokenHash));

        if (!(await ctx.isTenantActive())) throw new TenantSuspendedError();
        if (!input.user.isActive) throw new UserInactiveError();
        if (normalizeInviteEmail(input.user.email) !== normalizeInviteEmail(invitation.email)) {
          throw new EmailMismatchError();
        }
        if (await ctx.membershipExists(input.user.id, invitation.tenantId)) {
          throw new AlreadyMemberError();
        }

        await this.deps.membershipService.assertCanAcceptInContext(
          ctx,
          invitation.tenantId,
        );

        const membership = await ctx.insertMembership({
          userId: input.user.id,
          role: invitation.role,
        });
        await ctx.markAccepted(invitation.id, input.user.id);

        return {
          userId: input.user.id,
          tenantId: invitation.tenantId,
          membershipId: membership.id,
          role: invitation.role,
          invitationId: invitation.id,
        };
      },
    );

    return this.finishAccept(accepted);
  }

  async expireStale(): Promise<number> {
    const count = await this.deps.repository.expireStale(this.now());
    this.deps.logger.info("Stale team invitations expired", {
      action: "invitation.expire",
      count,
    });
    return count;
  }

  getSeats(tenantId: string) {
    return this.deps.membershipService.getSeatAvailability(tenantId);
  }

  private async finishAccept(accepted: AcceptedInvite): Promise<AcceptResult> {
    // Session issuance reuses the canonical auth use case. It runs after the
    // membership transaction commits so the use case can read the membership.
    const session = await this.deps.sessionIssuer.execute({
      userId: accepted.userId,
      tenantId: accepted.tenantId,
    });

    this.deps.logger.info("Team invitation accepted", {
      action: "invitation.accept",
      invitationId: accepted.invitationId,
      tenantId: accepted.tenantId,
      userId: accepted.userId,
    });

    return {
      invitationId: accepted.invitationId,
      tenantId: accepted.tenantId,
      role: accepted.role,
      session,
    };
  }

  private async assertEmailNotMember(tenantId: string, email: string): Promise<void> {
    const user = await this.deps.authRepository.findUserByEmail(email);
    if (!user) return;
    if (await this.deps.authRepository.checkMembershipExists(user.id, tenantId)) {
      throw new AlreadyMemberError();
    }
  }

  private async findByToken(token: string): Promise<InvitationRecord> {
    return this.findByTokenHash(this.deps.tokenService.hash(token));
  }

  private async findByTokenHash(tokenHash: string): Promise<InvitationRecord> {
    const invitation = await this.deps.repository.findByTokenHash(tokenHash);
    if (!invitation) throw new InviteInvalidError();
    return invitation;
  }

  private async requireUsableToken(
    lookup: Promise<InvitationRecord | null>,
  ): Promise<InvitationRecord> {
    const invitation = await lookup;
    if (!invitation) throw new InviteInvalidError();
    this.assertUsable(invitation);
    return invitation;
  }

  private async requireInvite(
    lookup: Promise<InvitationRecord | null>,
    tenantId: string,
  ): Promise<InvitationRecord> {
    const invitation = await lookup;
    if (!invitation || invitation.tenantId !== tenantId) throw new InviteInvalidError();
    return invitation;
  }

  private requirePending(invitation: InvitationRecord): void {
    if (invitation.status !== "PENDING") throw new InviteNotPendingError();
  }

  private assertUsable(invitation: InvitationRecord): void {
    const reason = getInviteInvalidReason(
      invitation.status,
      invitation.expiresAt,
      this.now(),
    );
    if (reason === "EXPIRED") throw new InviteExpiredError();
    if (reason === "INVALID") throw new InviteInvalidError();
  }

  private expiryDate(): Date {
    return new Date(this.now().getTime() + this.expiryDays * 24 * 60 * 60 * 1000);
  }

}

function toSummary(invitation: InvitationRecord): InviteSummary {
  return {
    id: invitation.id,
    tenantId: invitation.tenantId,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    lastSentAt: invitation.lastSentAt,
    sendCount: invitation.sendCount,
    createdAt: invitation.createdAt,
  };
}
