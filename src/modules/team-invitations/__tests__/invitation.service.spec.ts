import { describe, it, expect, vi, beforeEach } from "vitest";
import { InvitationService } from "../application/services/invitation.service";
import type {
  AcceptExistingUserInput,
  AcceptNewUserInput,
  InviteInput,
  InvitationServiceDeps,
} from "../application/services/invitation.service";
import type {
  InvitationLockContext,
  InvitationPreviewContext,
} from "../application/interfaces/invitation.repository";
import type { InvitationTokenService } from "../application/interfaces/invitation-token.service";
import type { InvitationRecord } from "../application/dto/invitation.dto";
import type { TenantMembershipService } from "../application/services/tenant-membership.service";
import type { PasswordService } from "../../auth/application/interfaces/password-service.interface";
import type { AuthRepository } from "../../auth/application/interfaces/auth-repository.interface";
import type { SelectTenantUseCase } from "../../auth/application/use-cases/select-tenant.use-case";
import type { SelectTenantOutput } from "../../auth/application/dto/select-tenant.dto";
import type { Logger } from "../../../shared/logging/logger.interface";
import {
  AccountExistsError,
  AlreadyMemberError,
  EmailMismatchError,
  InviteInvalidError,
  InviteNotPendingError,
  InviteExpiredError,
  TenantSuspendedError,
  UserInactiveError,
} from "../domain/errors/invitation.errors";
import { RoleNotInvitableError, TeamSeatLimitError } from "../domain/errors/invitation.errors";

const NOW = new Date("2026-01-10T00:00:00.000Z");
const EXPIRES = new Date("2026-01-17T00:00:00.000Z");
const TENANT_ID = "tenant-1";
const INVITER_ID = "user-inviter";

function makeInvite(overrides: Partial<InvitationRecord> = {}): InvitationRecord {
  return {
    id: "invite-1",
    tenantId: TENANT_ID,
    email: "alice@example.com",
    role: "USER",
    tokenHash: "hash-raw-token",
    status: "PENDING",
    invitedById: INVITER_ID,
    expiresAt: EXPIRES,
    acceptedAt: null,
    acceptedByUserId: null,
    revokedAt: null,
    lastSentAt: null,
    sendCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

type CtxOverrides = Partial<InvitationLockContext>;

function makeCtx(invite: InvitationRecord | null = makeInvite(), overrides: CtxOverrides = {}): InvitationLockContext {
  return {
    countActiveMembers: vi.fn().mockResolvedValue(0),
    countPendingInvites: vi.fn().mockResolvedValue(0),
    addMember: vi.fn().mockResolvedValue(undefined),
    findPendingByEmail: vi.fn().mockResolvedValue(null),
    findByTokenHash: vi.fn().mockResolvedValue(invite),
    findById: vi.fn().mockResolvedValue(invite),
    create: vi.fn().mockImplementation(async (input) => makeInvite({ ...input, id: "invite-new" })),
    rotateToken: vi.fn().mockImplementation(async (_id, tokenHash, expiresAt) =>
      makeInvite({ id: _id, tokenHash, expiresAt, sendCount: 1, lastSentAt: NOW }),
    ),
    markRevoked: vi.fn().mockResolvedValue(undefined),
    markAccepted: vi.fn().mockResolvedValue(undefined),
    findUserByEmail: vi.fn().mockResolvedValue(null),
    createUser: vi.fn().mockResolvedValue({ id: "user-new", email: "alice@example.com" }),
    insertMembership: vi.fn().mockResolvedValue({ id: "membership-new" }),
    membershipExists: vi.fn().mockResolvedValue(false),
    isTenantActive: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeTokenService(): InvitationTokenService {
  let counter = 0;
  return {
    generate: vi.fn(() => `raw-token-${++counter}`),
    hash: vi.fn((raw: string) => `hash-${raw}`),
    verify: vi.fn((raw: string, hash: string) => `hash-${raw}` === hash),
  };
}

function makeSession(): SelectTenantOutput {
  return {
    accessToken: "access",
    refreshToken: "refresh",
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: 604800,
    membership: {
      id: "membership-new",
      tenantId: TENANT_ID,
      tenantName: "Tenant One",
      role: "USER",
    },
  };
}

type MockFn = ReturnType<typeof vi.fn>;

type Harness = {
  service: InvitationService;
  ctx: InvitationLockContext;
  repo: {
    withInvitationLock: MockFn;
    findByTokenHash: MockFn;
    findById: MockFn;
    findPendingByEmail: MockFn;
    listByTenant: MockFn;
    markRevoked: MockFn;
    markAccepted: MockFn;
    rotateToken: MockFn;
    findPreviewContext: MockFn;
    expireStale: MockFn;
  };
  membership: {
    assertCanInviteInContext: MockFn;
    assertCanAcceptInContext: MockFn;
    getSeatAvailability: MockFn;
  };
  authRepo: {
    findUserByEmail: MockFn;
    checkMembershipExists: MockFn;
  };
  tokens: InvitationTokenService;
  password: PasswordService;
  sessionIssuer: { execute: MockFn };
  deliveryQueue: { enqueue: MockFn };
  logger: Logger;
};

function makeHarness(options: { invite?: InvitationRecord | null; overrides?: CtxOverrides } = {}): Harness {
  const invite = options.invite === undefined ? makeInvite() : options.invite;
  const ctx = makeCtx(invite, options.overrides);

  const repo = {
    withInvitationLock: vi.fn(async (_tenantId: string, work: (c: InvitationLockContext) => Promise<unknown>) => work(ctx)),
    findByTokenHash: vi.fn().mockResolvedValue(invite),
    findById: vi.fn().mockResolvedValue(invite),
    findPendingByEmail: vi.fn().mockResolvedValue(null),
    listByTenant: vi.fn().mockResolvedValue([invite]),
    markRevoked: vi.fn().mockResolvedValue(undefined),
    markAccepted: vi.fn().mockResolvedValue(undefined),
    rotateToken: vi.fn().mockResolvedValue(invite),
    findPreviewContext: vi.fn().mockResolvedValue({
      tenantName: "Tenant One",
      tenantIsActive: true,
      inviterName: "Inviter Name",
    } satisfies InvitationPreviewContext),
    expireStale: vi.fn().mockResolvedValue(3),
  };

  const membership = {
    assertCanInviteInContext: vi.fn().mockResolvedValue(undefined),
    assertCanAcceptInContext: vi.fn().mockResolvedValue(undefined),
    getSeatAvailability: vi.fn().mockResolvedValue({ used: 1, pending: 0, limit: 5, available: 4 }),
  };

  const authRepo = {
    findUserByEmail: vi.fn().mockResolvedValue(null),
    checkMembershipExists: vi.fn().mockResolvedValue(false),
  };

  const tokens = makeTokenService();
  const password: PasswordService = { hash: vi.fn().mockResolvedValue("hashed-password"), compare: vi.fn() };
  const sessionIssuer = { execute: vi.fn().mockResolvedValue(makeSession()) };
  const deliveryQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;

  const deps: InvitationServiceDeps = {
    repository: repo as never,
    membershipService: membership as unknown as TenantMembershipService,
    tokenService: tokens,
    passwordService: password,
    sessionIssuer: sessionIssuer as unknown as SelectTenantUseCase,
    authRepository: authRepo as unknown as Pick<AuthRepository, "findUserByEmail" | "checkMembershipExists">,
    deliveryQueue,
    logger,
    now: () => NOW,
    expiryDays: 7,
  };

  return {
    service: new InvitationService(deps),
    ctx,
    repo,
    membership,
    authRepo,
    tokens,
    password,
    sessionIssuer,
    deliveryQueue,
    logger,
  };
}

const inviteInput: InviteInput = {
  tenantId: TENANT_ID,
  inviterId: INVITER_ID,
  inviterRole: "OWNER",
  email: "alice@example.com",
  role: "USER",
};

describe("InvitationService", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  describe("createOrResend", () => {
    it("creates an invite with a hashed token and a 7-day expiry and never returns the token", async () => {
      const result = await h.service.createOrResend(inviteInput);

      expect(result.resent).toBe(false);
      expect(result.invitation.email).toBe("alice@example.com");
      expect(result.invitation).not.toHaveProperty("tokenHash");
      expect(result.invitation).not.toHaveProperty("token");
      expect(h.ctx.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          email: "alice@example.com",
          role: "USER",
          tokenHash: "hash-raw-token-1",
          invitedById: INVITER_ID,
          expiresAt: EXPIRES,
        }),
      );
    });

    it("normalises the email before storage", async () => {
      await h.service.createOrResend({ ...inviteInput, email: "  ALICE@Example.COM " });

      expect(h.ctx.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: "alice@example.com" }),
      );
    });

    it("rejects when the email already belongs to a workspace member", async () => {
      vi.mocked(h.authRepo.findUserByEmail).mockResolvedValue({ id: "user-alice" });
      vi.mocked(h.authRepo.checkMembershipExists).mockResolvedValue(true);

      await expect(h.service.createOrResend(inviteInput)).rejects.toBeInstanceOf(AlreadyMemberError);
      expect(h.ctx.create).not.toHaveBeenCalled();
    });

    it("rotates the token and resets expiry instead of creating a duplicate pending invite", async () => {
      const pending = makeInvite({ id: "invite-existing", sendCount: 2 });
      vi.mocked(h.ctx.findPendingByEmail).mockResolvedValue(pending);

      const result = await h.service.createOrResend(inviteInput);

      expect(result.resent).toBe(true);
      expect(h.ctx.create).not.toHaveBeenCalled();
      expect(h.ctx.rotateToken).toHaveBeenCalledWith("invite-existing", "hash-raw-token-1", EXPIRES);
    });

    it("propagates a role-escalation rejection without creating an invite", async () => {
      vi.mocked(h.membership.assertCanInviteInContext).mockRejectedValue(new RoleNotInvitableError());

      await expect(h.service.createOrResend(inviteInput)).rejects.toBeInstanceOf(RoleNotInvitableError);
      expect(h.ctx.create).not.toHaveBeenCalled();
    });

    it("propagates a seat-limit rejection without creating an invite", async () => {
      vi.mocked(h.membership.assertCanInviteInContext).mockRejectedValue(new TeamSeatLimitError());

      await expect(h.service.createOrResend(inviteInput)).rejects.toBeInstanceOf(TeamSeatLimitError);
      expect(h.ctx.create).not.toHaveBeenCalled();
    });

    it("rejects invites for a suspended tenant", async () => {
      vi.mocked(h.ctx.isTenantActive).mockResolvedValue(false);

      await expect(h.service.createOrResend(inviteInput)).rejects.toBeInstanceOf(TenantSuspendedError);
      expect(h.ctx.create).not.toHaveBeenCalled();
    });

    it("logs the invite lifecycle without the token or full email", async () => {
      await h.service.createOrResend(inviteInput);

      const infoCalls = vi.mocked(h.logger.info).mock.calls as Array<[string, Record<string, unknown>?]>;
      for (const [, context] of infoCalls) {
        const serialised = JSON.stringify(context ?? {});
        expect(serialised).not.toContain("raw-token");
        expect(serialised).not.toContain("alice@example.com");
      }
    });

    it("enqueues delivery with only the invitation id", async () => {
      await h.service.createOrResend(inviteInput);

      expect(h.deliveryQueue.enqueue).toHaveBeenCalledWith({ invitationId: "invite-new" });
      expect(Object.keys(vi.mocked(h.deliveryQueue.enqueue).mock.calls[0][0])).toEqual(["invitationId"]);
    });

    it("does not fail the request when enqueueing fails", async () => {
      h.deliveryQueue.enqueue.mockRejectedValue(new Error("redis down"));

      await expect(h.service.createOrResend(inviteInput)).resolves.toMatchObject({ resent: false });
    });
  });

  describe("list", () => {
    it("delegates to the repository with the tenant and optional status", async () => {
      const result = await h.service.list({ tenantId: TENANT_ID, status: "PENDING" });

      expect(h.repo.listByTenant).toHaveBeenCalledWith(TENANT_ID, "PENDING");
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty("tokenHash");
    });
  });

  describe("revoke", () => {
    it("marks a pending invite as revoked", async () => {
      await h.service.revoke(TENANT_ID, "invite-1");

      expect(h.ctx.markRevoked).toHaveBeenCalledWith("invite-1");
    });

    it("rejects revoking an invite from another tenant", async () => {
      await expect(h.service.revoke("other-tenant", "invite-1")).rejects.toBeInstanceOf(InviteInvalidError);
      expect(h.ctx.markRevoked).not.toHaveBeenCalled();
    });

    it("rejects revoking a non-pending invite", async () => {
      const h2 = makeHarness({ invite: makeInvite({ status: "ACCEPTED" }) });

      await expect(h2.service.revoke(TENANT_ID, "invite-1")).rejects.toBeInstanceOf(InviteNotPendingError);
    });
  });

  describe("resend", () => {
    it("rotates the token on an existing pending invite", async () => {
      const result = await h.service.resend(TENANT_ID, "invite-1");

      expect(result.resent).toBe(true);
      expect(h.ctx.rotateToken).toHaveBeenCalledWith("invite-1", "hash-raw-token-1", EXPIRES);
    });

    it("enqueues delivery after rotating the token", async () => {
      await h.service.resend(TENANT_ID, "invite-1");

      expect(h.deliveryQueue.enqueue).toHaveBeenCalledWith({ invitationId: "invite-1" });
    });

    it("rejects resending a revoked invite", async () => {
      const h2 = makeHarness({ invite: makeInvite({ status: "REVOKED" }) });

      await expect(h2.service.resend(TENANT_ID, "invite-1")).rejects.toBeInstanceOf(InviteNotPendingError);
      expect(h2.deliveryQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe("preview", () => {
    it("returns masked email, inviter/tenant names and accountExists", async () => {
      vi.mocked(h.authRepo.findUserByEmail).mockResolvedValue({ id: "user-alice" });

      const result = await h.service.preview("raw-token");

      expect(result).toMatchObject({
        email: "a***@example.com",
        role: "USER",
        tenantName: "Tenant One",
        inviterName: "Inviter Name",
        accountExists: true,
      });
      expect(result).not.toHaveProperty("tokenHash");
      expect(result).not.toHaveProperty("token");
    });

    it("returns accountExists false for a new email", async () => {
      const result = await h.service.preview("raw-token");

      expect(result.accountExists).toBe(false);
    });

    it("throws INVITE_INVALID for an unknown token", async () => {
      vi.mocked(h.repo.findByTokenHash).mockResolvedValue(null);

      await expect(h.service.preview("unknown")).rejects.toBeInstanceOf(InviteInvalidError);
    });

    it("throws INVITE_EXPIRED for an expired pending invite", async () => {
      const h2 = makeHarness({ invite: makeInvite({ expiresAt: new Date(NOW.getTime() - 1) }) });

      await expect(h2.service.preview("raw-token")).rejects.toBeInstanceOf(InviteExpiredError);
    });

    it("throws INVITE_INVALID for a revoked invite", async () => {
      const h2 = makeHarness({ invite: makeInvite({ status: "REVOKED" }) });

      await expect(h2.service.preview("raw-token")).rejects.toBeInstanceOf(InviteInvalidError);
    });
  });

  describe("acceptNewUser", () => {
    const input: AcceptNewUserInput = {
      token: "raw-token",
      name: "Alice",
      password: "StrongPass1",
    };

    it("creates the user with the invite email, hashed password, membership and session", async () => {
      const result = await h.service.acceptNewUser(input);

      expect(h.ctx.createUser).toHaveBeenCalledWith({
        email: "alice@example.com",
        name: "Alice",
        passwordHash: "hashed-password",
      });
      expect(h.ctx.insertMembership).toHaveBeenCalledWith({
        userId: "user-new",
        role: "USER",
      });
      expect(h.ctx.markAccepted).toHaveBeenCalledWith("invite-1", "user-new");
      expect(h.sessionIssuer.execute).toHaveBeenCalledWith({ userId: "user-new", tenantId: TENANT_ID });
      expect(result.session).toMatchObject({ accessToken: "access", refreshToken: "refresh" });
      expect(result).not.toHaveProperty("tokenHash");
    });

    it("re-validates the token hash inside the lock", async () => {
      await h.service.acceptNewUser(input);

      expect(h.ctx.findByTokenHash).toHaveBeenCalledWith("hash-raw-token");
    });

    it("rejects an expired invite before creating a user", async () => {
      const h2 = makeHarness({ invite: makeInvite({ expiresAt: new Date(NOW.getTime() - 1) }) });

      await expect(h2.service.acceptNewUser(input)).rejects.toBeInstanceOf(InviteExpiredError);
      expect(h2.ctx.createUser).not.toHaveBeenCalled();
    });

    it("rejects an accepted invite", async () => {
      const h2 = makeHarness({ invite: makeInvite({ status: "ACCEPTED" }) });

      await expect(h2.service.acceptNewUser(input)).rejects.toBeInstanceOf(InviteInvalidError);
      expect(h2.ctx.createUser).not.toHaveBeenCalled();
    });

    it("rejects when the seat limit is reached inside the lock", async () => {
      vi.mocked(h.membership.assertCanAcceptInContext).mockRejectedValue(new TeamSeatLimitError());

      await expect(h.service.acceptNewUser(input)).rejects.toBeInstanceOf(TeamSeatLimitError);
      expect(h.ctx.createUser).not.toHaveBeenCalled();
    });

    it("rejects a suspended tenant inside the lock", async () => {
      vi.mocked(h.ctx.isTenantActive).mockResolvedValue(false);

      await expect(h.service.acceptNewUser(input)).rejects.toBeInstanceOf(TenantSuspendedError);
      expect(h.ctx.createUser).not.toHaveBeenCalled();
    });

    it("requires login instead of creating a second account for an existing email", async () => {
      vi.mocked(h.ctx.findUserByEmail).mockResolvedValue({ id: "user-existing", email: "alice@example.com", isActive: true });

      await expect(h.service.acceptNewUser(input)).rejects.toBeInstanceOf(AccountExistsError);
      expect(h.ctx.createUser).not.toHaveBeenCalled();
    });
  });

  describe("acceptExistingUser", () => {
    const input: AcceptExistingUserInput = {
      token: "raw-token",
      user: { id: "user-existing", email: "alice@example.com", isActive: true },
    };

    it("attaches the authenticated user to the tenant and issues a session", async () => {
      const result = await h.service.acceptExistingUser(input);

      expect(h.ctx.insertMembership).toHaveBeenCalledWith({
        userId: "user-existing",
        role: "USER",
      });
      expect(h.ctx.markAccepted).toHaveBeenCalledWith("invite-1", "user-existing");
      expect(h.ctx.createUser).not.toHaveBeenCalled();
      expect(h.sessionIssuer.execute).toHaveBeenCalledWith({ userId: "user-existing", tenantId: TENANT_ID });
      expect(result.session).toMatchObject({ accessToken: "access" });
    });

    it("matches the email case-insensitively", async () => {
      await expect(
        h.service.acceptExistingUser({
          ...input,
          user: { ...input.user, email: "  ALICE@EXAMPLE.COM " },
        }),
      ).resolves.toBeDefined();
    });

    it("rejects a logged-in account with a different email", async () => {
      await expect(
        h.service.acceptExistingUser({
          ...input,
          user: { ...input.user, email: "bob@example.com" },
        }),
      ).rejects.toBeInstanceOf(EmailMismatchError);
      expect(h.ctx.insertMembership).not.toHaveBeenCalled();
    });

    it("rejects an already-existing membership", async () => {
      vi.mocked(h.ctx.membershipExists).mockResolvedValue(true);

      await expect(h.service.acceptExistingUser(input)).rejects.toBeInstanceOf(AlreadyMemberError);
      expect(h.ctx.insertMembership).not.toHaveBeenCalled();
    });

    it("rejects an inactive user", async () => {
      await expect(
        h.service.acceptExistingUser({
          ...input,
          user: { ...input.user, isActive: false },
        }),
      ).rejects.toBeInstanceOf(UserInactiveError);
      expect(h.ctx.insertMembership).not.toHaveBeenCalled();
    });

    it("rejects a suspended tenant", async () => {
      vi.mocked(h.ctx.isTenantActive).mockResolvedValue(false);

      await expect(h.service.acceptExistingUser(input)).rejects.toBeInstanceOf(TenantSuspendedError);
      expect(h.ctx.insertMembership).not.toHaveBeenCalled();
    });

    it("rejects when the seat limit is reached inside the lock", async () => {
      vi.mocked(h.membership.assertCanAcceptInContext).mockRejectedValue(new TeamSeatLimitError());

      await expect(h.service.acceptExistingUser(input)).rejects.toBeInstanceOf(TeamSeatLimitError);
      expect(h.ctx.insertMembership).not.toHaveBeenCalled();
    });
  });

  describe("expireStale", () => {
    it("returns the number of invites flipped to EXPIRED", async () => {
      await expect(h.service.expireStale()).resolves.toBe(3);
      expect(h.repo.expireStale).toHaveBeenCalledWith(NOW);
    });
  });

  describe("getSeats", () => {
    it("delegates to the membership service", async () => {
      await expect(h.service.getSeats(TENANT_ID)).resolves.toEqual({
        used: 1,
        pending: 0,
        limit: 5,
        available: 4,
      });
      expect(h.membership.getSeatAvailability).toHaveBeenCalledWith(TENANT_ID);
    });
  });
});
