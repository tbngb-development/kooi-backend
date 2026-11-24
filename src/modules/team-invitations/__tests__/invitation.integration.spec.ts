import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import type { InvitationStatus, TenantRole } from "@prisma/client";
import { buildTenantInvitationRoutes } from "../presentation/tenant-invitation.routes";
import { buildPublicInvitationRoutes } from "../presentation/public-invitation.routes";
import { TenantInvitationController } from "../presentation/tenant-invitation.controller";
import { PublicInvitationController } from "../presentation/public-invitation.controller";
import { InvitationService } from "../application/services/invitation.service";
import { TenantMembershipService } from "../application/services/tenant-membership.service";
import type {
  InvitationLockContext,
  InvitationPreviewContext,
  InvitationRepository,
} from "../application/interfaces/invitation.repository";
import type { InvitationTokenService } from "../application/interfaces/invitation-token.service";
import type {
  CreateInvitationInput,
  InvitationRecord,
} from "../application/dto/invitation.dto";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type { PasswordService } from "../../auth/application/interfaces/password-service.interface";
import type { AuthRepository } from "../../auth/application/interfaces/auth-repository.interface";
import type { SelectTenantUseCase } from "../../auth/application/use-cases/select-tenant.use-case";
import type { SelectTenantOutput } from "../../auth/application/dto/select-tenant.dto";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import type { Logger } from "../../../shared/logging/logger.interface";
import { createErrorHandler } from "../../../shared/middleware/error-handler";
import type { AuthContext, TenantAuthContext } from "../../../shared/types";

const TENANT_ID = "tenant-1";
const INVITER_ID = "user-owner";
const NOW = new Date("2026-01-10T00:00:00.000Z");

interface StoredUser {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  passwordHash: string;
}
interface StoredMembership {
  id: string;
  userId: string;
  tenantId: string;
  role: TenantRole;
}

/** In-memory repository with a real mutex so concurrency tests are meaningful. */
class InMemoryInvitationRepository implements InvitationRepository {
  invitations: InvitationRecord[] = [];
  users: StoredUser[] = [];
  memberships: StoredMembership[] = [];
  tenants = new Map<string, { id: string; name: string; isActive: boolean }>([
    [TENANT_ID, { id: TENANT_ID, name: "Tenant One", isActive: true }],
  ]);

  private sequence = 0;
  private tail: Promise<void> = Promise.resolve();

  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.tail;
    this.tail = previous.then(() => gate);
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  private makeContext(tenantId: string): InvitationLockContext {
    return {
      countActiveMembers: async () =>
        this.memberships.filter((m) => m.tenantId === tenantId).length,
      countPendingInvites: async () =>
        this.invitations.filter(
          (i) =>
            i.tenantId === tenantId &&
            i.status === "PENDING" &&
            i.expiresAt > new Date(),
        ).length,
      addMember: async (input) => {
        this.addMembership(tenantId, input.userId, input.role);
      },
      findPendingByEmail: async (email) =>
        this.invitations.find(
          (i) =>
            i.tenantId === tenantId &&
            i.email.toLowerCase() === email.toLowerCase() &&
            i.status === "PENDING" &&
            i.expiresAt > new Date(),
        ) ?? null,
      findByTokenHash: async (tokenHash) =>
        this.invitations.find((i) => i.tokenHash === tokenHash) ?? null,
      findById: async (id) =>
        this.invitations.find((i) => i.id === id) ?? null,
      create: async (input) => this.insertInvitation(input),
      rotateToken: async (id, tokenHash, expiresAt) => {
        const invitation = this.invitations.find((i) => i.id === id);
        if (!invitation) throw new Error("invitation missing");
        invitation.tokenHash = tokenHash;
        invitation.expiresAt = expiresAt;
        invitation.status = "PENDING";
        invitation.revokedAt = null;
        return invitation;
      },
      markRevoked: async (id) => {
        const invitation = this.invitations.find((i) => i.id === id);
        if (invitation) {
          invitation.status = "REVOKED";
          invitation.revokedAt = new Date();
        }
      },
      markAccepted: async (id, userId) => {
        const invitation = this.invitations.find((i) => i.id === id);
        if (invitation) {
          invitation.status = "ACCEPTED";
          invitation.acceptedAt = new Date();
          invitation.acceptedByUserId = userId;
        }
      },
      findUserByEmail: async (email) => {
        const user = this.users.find(
          (u) => u.email.toLowerCase() === email.toLowerCase(),
        );
        return user ? { id: user.id, email: user.email, isActive: user.isActive } : null;
      },
      createUser: async (input) => {
        const user: StoredUser = {
          id: this.nextId("user"),
          email: input.email,
          name: input.name,
          isActive: true,
          passwordHash: input.passwordHash,
        };
        this.users.push(user);
        return { id: user.id, email: user.email };
      },
      insertMembership: async (input) => {
        const membership = this.addMembership(tenantId, input.userId, input.role);
        return { id: membership.id };
      },
      membershipExists: async (userId, targetTenantId) =>
        this.memberships.some(
          (m) => m.userId === userId && m.tenantId === targetTenantId,
        ),
      isTenantActive: async () => this.tenants.get(tenantId)?.isActive ?? false,
    };
  }

  private addMembership(tenantId: string, userId: string, role: TenantRole) {
    if (this.memberships.some((m) => m.userId === userId && m.tenantId === tenantId)) {
      throw new Error("ALREADY_MEMBER");
    }
    const membership: StoredMembership = {
      id: this.nextId("membership"),
      tenantId,
      userId,
      role,
    };
    this.memberships.push(membership);
    return membership;
  }

  private insertInvitation(input: CreateInvitationInput): InvitationRecord {
    const record: InvitationRecord = {
      id: this.nextId("invite"),
      ...input,
      status: "PENDING",
      acceptedAt: null,
      acceptedByUserId: null,
      revokedAt: null,
      lastSentAt: null,
      sendCount: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.invitations.push(record);
    return record;
  }

  withSeatLock<T>(tenantId: string, work: (ctx: InvitationLockContext) => Promise<T>): Promise<T> {
    return this.exclusive(() => work(this.makeContext(tenantId)));
  }

  withInvitationLock<T>(tenantId: string, work: (ctx: InvitationLockContext) => Promise<T>): Promise<T> {
    return this.exclusive(() => work(this.makeContext(tenantId)));
  }

  countActiveMembers(tenantId: string): Promise<number> {
    return Promise.resolve(this.memberships.filter((m) => m.tenantId === tenantId).length);
  }

  countPendingInvites(tenantId: string): Promise<number> {
    return Promise.resolve(
      this.invitations.filter(
        (i) => i.tenantId === tenantId && i.status === "PENDING" && i.expiresAt > new Date(),
      ).length,
    );
  }

  addMember(tenantId: string, input: { userId: string; role: TenantRole }): Promise<void> {
    this.addMembership(tenantId, input.userId, input.role);
    return Promise.resolve();
  }

  create(input: CreateInvitationInput): Promise<InvitationRecord> {
    return Promise.resolve(this.insertInvitation(input));
  }

  findById(id: string): Promise<InvitationRecord | null> {
    return Promise.resolve(this.invitations.find((i) => i.id === id) ?? null);
  }

  findByTokenHash(tokenHash: string): Promise<InvitationRecord | null> {
    return Promise.resolve(this.invitations.find((i) => i.tokenHash === tokenHash) ?? null);
  }

  findPendingByEmail(tenantId: string, email: string): Promise<InvitationRecord | null> {
    return Promise.resolve(
      this.invitations.find(
        (i) =>
          i.tenantId === tenantId &&
          i.email.toLowerCase() === email.toLowerCase() &&
          i.status === "PENDING" &&
          i.expiresAt > new Date(),
      ) ?? null,
    );
  }

  listByTenant(tenantId: string, status?: InvitationStatus): Promise<InvitationRecord[]> {
    return Promise.resolve(
      this.invitations.filter((i) => i.tenantId === tenantId && (!status || i.status === status)),
    );
  }

  markAccepted(id: string, userId: string): Promise<void> {
    const invite = this.invitations.find((i) => i.id === id);
    if (invite) {
      invite.status = "ACCEPTED";
      invite.acceptedAt = new Date();
      invite.acceptedByUserId = userId;
    }
    return Promise.resolve();
  }

  markRevoked(id: string): Promise<void> {
    const invite = this.invitations.find((i) => i.id === id);
    if (invite) invite.status = "REVOKED";
    return Promise.resolve();
  }

  markExpired(id: string): Promise<void> {
    const invite = this.invitations.find((i) => i.id === id);
    if (invite) invite.status = "EXPIRED";
    return Promise.resolve();
  }

  touchSent(id: string): Promise<void> {
    const invite = this.invitations.find((i) => i.id === id);
    if (invite) {
      invite.lastSentAt = new Date();
      invite.sendCount += 1;
    }
    return Promise.resolve();
  }

  rotateToken(id: string, tokenHash: string, expiresAt: Date): Promise<InvitationRecord> {
    const invite = this.invitations.find((i) => i.id === id);
    if (!invite) throw new Error("invitation missing");
    invite.tokenHash = tokenHash;
    invite.expiresAt = expiresAt;
    return Promise.resolve(invite);
  }

  setTokenHash(id: string, tokenHash: string): Promise<void> {
    const invite = this.invitations.find((i) => i.id === id);
    if (invite) invite.tokenHash = tokenHash;
    return Promise.resolve();
  }

  findPreviewContext(invitationId: string): Promise<InvitationPreviewContext | null> {
    const invite = this.invitations.find((i) => i.id === invitationId);
    if (!invite) return Promise.resolve(null);
    return Promise.resolve({
      tenantName: this.tenants.get(invite.tenantId)?.name ?? "Unknown",
      tenantIsActive: this.tenants.get(invite.tenantId)?.isActive ?? false,
      inviterName: "Workspace Owner",
    });
  }

  expireStale(now: Date): Promise<number> {
    let count = 0;
    for (const invite of this.invitations) {
      if (invite.status === "PENDING" && invite.expiresAt <= now) {
        invite.status = "EXPIRED";
        count += 1;
      }
    }
    return Promise.resolve(count);
  }
}

class RecordingTokenService implements InvitationTokenService {
  readonly generated: string[] = [];

  generate(): string {
    const token = `raw-token-${this.generated.length + 1}`;
    this.generated.push(token);
    return token;
  }

  hash(rawToken: string): string {
    return `hash:${rawToken}`;
  }

  verify(rawToken: string, tokenHash: string): boolean {
    return this.hash(rawToken) === tokenHash;
  }
}

const OWNER: TenantAuthContext = {
  type: "tenant",
  userId: INVITER_ID,
  email: "owner@example.com",
  membershipId: "membership-owner",
  tenantId: TENANT_ID,
  tenantRole: "OWNER",
  isPlatformAdmin: false,
};

interface Harness {
  app: express.Express;
  repo: InMemoryInvitationRepository;
  tokens: RecordingTokenService;
  logs: string[];
  publicUser: { user: AuthContext | undefined };
  currentUser: { value: TenantAuthContext | null };
  limiterSpy: ReturnType<typeof vi.fn>;
  deliveryQueue: { enqueue: ReturnType<typeof vi.fn> };
}

function makeApp(limit: number | null = 5): Harness {
  const repo = new InMemoryInvitationRepository();
  const tokens = new RecordingTokenService();
  const logs: string[] = [];
  const logger: Logger = {
    debug: vi.fn(),
    info: (message, context) => logs.push(JSON.stringify({ message, context })),
    warn: (message, context) => logs.push(JSON.stringify({ message, context })),
    error: (message, error, context) => logs.push(JSON.stringify({ message, error, context })),
    child: () => logger,
  };

  const planRepo = {
    getActivePlanForTenant: vi.fn().mockResolvedValue(limit === null ? null : { maxTeamMembers: limit }),
  } as unknown as PlanRepository;
  const membershipService = new TenantMembershipService(repo, planRepo);

  const password: PasswordService = {
    hash: vi.fn(async (plain) => `hashed:${plain}`),
    compare: vi.fn(),
  };
  const authRepo = {
    findUserByEmail: vi.fn(async (email: string) => {
      const user = repo.users.find(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
      );
      return user ?? null;
    }),
    checkMembershipExists: vi.fn(async (userId: string, tenantId: string) =>
      repo.memberships.some((m) => m.userId === userId && m.tenantId === tenantId),
    ),
  } as unknown as AuthRepository;

  const sessionOutput: SelectTenantOutput = {
    accessToken: "issued-access-token",
    refreshToken: "issued-refresh-token",
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: 604800,
    membership: {
      id: "membership-new",
      tenantId: TENANT_ID,
      tenantName: "Tenant One",
      role: "USER",
    },
  };
  const sessionIssuer = {
    execute: vi.fn().mockResolvedValue(sessionOutput),
  } as unknown as SelectTenantUseCase;
  const deliveryQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };

  const service = new InvitationService({
    repository: repo,
    membershipService,
    tokenService: tokens,
    passwordService: password,
    sessionIssuer,
    authRepository: authRepo as Pick<AuthRepository, "findUserByEmail" | "checkMembershipExists">,
    deliveryQueue,
    logger,
    now: () => new Date(),
    expiryDays: 7,
  });

  const currentUser = { value: OWNER };
  const publicUser: { user: AuthContext | undefined } = { user: undefined };
  const authenticate = {
    tenant: () => (req: Request, res: Response, next: NextFunction) => {
      if (!currentUser.value) {
        res.status(401).json({ success: false, error: "Authentication token not provided" });
        return;
      }
      (req as Request & { user: AuthContext }).user = currentUser.value;
      next();
    },
    optional: () => (req: Request, _res: Response, next: NextFunction) => {
      if (publicUser.user) (req as Request & { user?: AuthContext }).user = publicUser.user;
      next();
    },
  } as unknown as AuthenticateMiddleware;

  const authorize = {
    tenantRoles:
      (...allowed: TenantRole[]) =>
      (req: Request, res: Response, next: NextFunction) => {
        const user = (req as Request & { user?: AuthContext }).user;
        if (!user || user.type !== "tenant" || !allowed.includes(user.tenantRole)) {
          res.status(403).json({ success: false, error: "Forbidden" });
          return;
        }
        next();
      },
  } as unknown as AuthorizeMiddleware;

  const limiterSpy = vi.fn((_req: Request, _res: Response, next: NextFunction) => next());
  const noopLimiter = limiterSpy as unknown as Parameters<typeof buildTenantInvitationRoutes>[3];

  const app = express();
  app.use(express.json());
  app.use(
    "/v1/tenants/current",
    buildTenantInvitationRoutes(
      new TenantInvitationController(service),
      authenticate,
      authorize,
      noopLimiter,
    ),
  );
  app.use(
    "/v1/invitations",
    buildPublicInvitationRoutes(
      new PublicInvitationController(service),
      authenticate,
      noopLimiter,
      noopLimiter,
    ),
  );
  app.use(createErrorHandler(logger));

  return { app, repo, tokens, logs, publicUser, currentUser, limiterSpy, deliveryQueue };
}

describe("Team invitation HTTP integration", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeApp();
  });

  describe("tenant invitation management", () => {
    it("invites a new email without returning or storing the raw token", async () => {
      const response = await request(h.app)
        .post("/v1/tenants/current/invitations")
        .send({ email: "Alice@Example.COM", role: "USER" });

      expect(response.status).toBe(201);
      expect(response.body.data.invitation.email).toBe("alice@example.com");
      expect(JSON.stringify(response.body)).not.toContain(h.tokens.generated[0]);
      expect(h.repo.invitations).toHaveLength(1);
      expect(h.repo.invitations[0].tokenHash).not.toBe(h.tokens.generated[0]);
      expect(h.repo.invitations[0].tokenHash).toBe(`hash:${h.tokens.generated[0]}`);
      expect(h.deliveryQueue.enqueue).toHaveBeenCalledWith({
        invitationId: h.repo.invitations[0].id,
      });
    });

    it("invites an existing user without disclosing that an account exists", async () => {
      h.repo.users.push({
        id: "user-alice",
        email: "alice@example.com",
        name: "Alice",
        isActive: true,
        passwordHash: "hash",
      });

      const response = await request(h.app)
        .post("/v1/tenants/current/invitations")
        .send({ email: "alice@example.com", role: "USER" });

      expect(response.status).toBe(201);
      expect(JSON.stringify(response.body)).not.toContain("ACCOUNT_EXISTS");
    });

    it("rejects inviting an existing workspace member with 409", async () => {
      h.repo.users.push({
        id: "user-alice",
        email: "alice@example.com",
        name: "Alice",
        isActive: true,
        passwordHash: "hash",
      });
      h.repo.memberships.push({
        id: "membership-alice",
        userId: "user-alice",
        tenantId: TENANT_ID,
        role: "USER",
      });

      const response = await request(h.app)
        .post("/v1/tenants/current/invitations")
        .send({ email: "alice@example.com", role: "USER" });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("ALREADY_MEMBER");
    });

    it("resends a duplicate pending invite by rotating the token", async () => {
      const first = await request(h.app)
        .post("/v1/tenants/current/invitations")
        .send({ email: "alice@example.com", role: "USER" });
      const originalToken = h.tokens.generated[0];

      const second = await request(h.app)
        .post("/v1/tenants/current/invitations")
        .send({ email: "ALICE@example.com", role: "USER" });

      expect(second.status).toBe(201);
      expect(second.body.data.resent).toBe(true);
      expect(h.repo.invitations).toHaveLength(1);
      expect(h.repo.invitations[0].sendCount).toBe(0);
      expect(h.repo.invitations[0].lastSentAt).toBeNull();
      expect(h.repo.invitations[0].tokenHash).toBe(`hash:${h.tokens.generated[1]}`);

      const stalePreview = await request(h.app)
        .get("/v1/invitations/preview")
        .query({ token: originalToken });
      expect(stalePreview.status).toBe(404);
      expect(stalePreview.body.code).toBe("INVITE_INVALID");
      expect(first.body.data.invitation.id).toBe(second.body.data.invitation.id);
    });

    it("rejects role escalation by ADMIN to OWNER", async () => {
      h.currentUser.value = { ...OWNER, tenantRole: "ADMIN", userId: "user-admin" };

      const response = await request(h.app)
        .post("/v1/tenants/current/invitations")
        .send({ email: "alice@example.com", role: "OWNER" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("FORBIDDEN_ROLE");
    });

    it("rejects a suspended tenant", async () => {
      h.repo.tenants.set(TENANT_ID, { id: TENANT_ID, name: "Tenant One", isActive: false });

      const response = await request(h.app)
        .post("/v1/tenants/current/invitations")
        .send({ email: "alice@example.com", role: "USER" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("TENANT_SUSPENDED");
    });

    it("lists invitations and seats, and revokes an invite", async () => {
      const created = await request(h.app)
        .post("/v1/tenants/current/invitations")
        .send({ email: "alice@example.com", role: "USER" });
      const id = created.body.data.invitation.id;

      const listed = await request(h.app).get("/v1/tenants/current/invitations");
      expect(listed.status).toBe(200);
      expect(listed.body.data.items).toHaveLength(1);

      const seats = await request(h.app).get("/v1/tenants/current/seats");
      expect(seats.status).toBe(200);
      expect(seats.body.data).toMatchObject({ used: 0, pending: 1, limit: 5, available: 4 });

      const revoked = await request(h.app).delete(`/v1/tenants/current/invitations/${id}`);
      expect(revoked.status).toBe(200);
      expect(h.repo.invitations[0].status).toBe("REVOKED");
    });

    it("enforces the seat limit at invite time", async () => {
      const limited = makeApp(2);
      limited.repo.memberships.push({
        id: "m1", userId: "u1", tenantId: TENANT_ID, role: "USER",
      });
      limited.repo.memberships.push({
        id: "m2", userId: "u2", tenantId: TENANT_ID, role: "USER",
      });

      const response = await request(limited.app)
        .post("/v1/tenants/current/invitations")
        .send({ email: "alice@example.com", role: "USER" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("SEAT_LIMIT_REACHED");
    });

    it("allows exactly one of two concurrent invites for a single remaining seat", async () => {
      const limited = makeApp(2);
      limited.repo.memberships.push({
        id: "m1", userId: "u1", tenantId: TENANT_ID, role: "USER",
      });

      const [first, second] = await Promise.all([
        request(limited.app)
          .post("/v1/tenants/current/invitations")
          .send({ email: "alice@example.com", role: "USER" }),
        request(limited.app)
          .post("/v1/tenants/current/invitations")
          .send({ email: "bob@example.com", role: "USER" }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([201, 403]);
      expect(limited.repo.invitations).toHaveLength(1);
    });
  });

  describe("public preview and accept", () => {
    async function createInvite(email = "alice@example.com") {
      await request(h.app)
        .post("/v1/tenants/current/invitations")
        .send({ email, role: "USER" });
      return h.tokens.generated[h.tokens.generated.length - 1];
    }

    it("previews a pending invite with a masked email", async () => {
      const token = await createInvite();

      const response = await request(h.app)
        .get("/v1/invitations/preview")
        .query({ token });

      expect(response.status).toBe(200);
      expect(response.body.data.email).toBe("a***@example.com");
      expect(response.body.data.tenantName).toBe("Tenant One");
      expect(response.body.data.accountExists).toBe(false);
      expect(JSON.stringify(response.body)).not.toContain(token);
    });

    it("accepts as a new user, sets session cookies and marks the invite accepted", async () => {
      const token = await createInvite();

      const response = await request(h.app)
        .post("/v1/invitations/accept")
        .send({ token, name: "Alice", password: "StrongPass1" });

      expect(response.status).toBe(200);
      expect(response.body.data.tenantId).toBe(TENANT_ID);
      const cookies = response.headers["set-cookie"] as unknown as string[] | undefined;
      expect(cookies?.some((c) => c.includes("access_token=issued-access-token"))).toBe(true);
      expect(cookies?.some((c) => c.includes("refresh_token=issued-refresh-token"))).toBe(true);
      expect(h.repo.users[0]).toMatchObject({ email: "alice@example.com", name: "Alice" });
      expect(h.repo.memberships[0]).toMatchObject({ userId: h.repo.users[0].id, role: "USER" });
      expect(h.repo.invitations[0].status).toBe("ACCEPTED");
      expect(JSON.stringify(response.body)).not.toContain(token);
    });

    it("accepts as an existing logged-in user", async () => {
      h.repo.users.push({
        id: "user-alice", email: "alice@example.com", name: "Alice",
        isActive: true, passwordHash: "hash",
      });
      const token = await createInvite();
      h.publicUser.user = {
        type: "base",
        userId: "user-alice",
        email: "alice@example.com",
        isPlatformAdmin: false,
      };

      const response = await request(h.app)
        .post("/v1/invitations/accept")
        .send({ token });

      expect(response.status).toBe(200);
      expect(h.repo.users).toHaveLength(1);
      expect(h.repo.memberships[0]).toMatchObject({ userId: "user-alice", tenantId: TENANT_ID });
    });

    it("rejects an email mismatch for an existing user", async () => {
      h.repo.users.push({
        id: "user-bob", email: "bob@example.com", name: "Bob",
        isActive: true, passwordHash: "hash",
      });
      const token = await createInvite();
      h.publicUser.user = {
        type: "base", userId: "user-bob", email: "bob@example.com", isPlatformAdmin: false,
      };

      const response = await request(h.app)
        .post("/v1/invitations/accept")
        .send({ token });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("EMAIL_MISMATCH");
    });

    it("rejects accepting a revoked invite", async () => {
      const token = await createInvite();
      const id = h.repo.invitations[0].id;
      await request(h.app).delete(`/v1/tenants/current/invitations/${id}`);

      const response = await request(h.app)
        .post("/v1/invitations/accept")
        .send({ token, name: "Alice", password: "StrongPass1" });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("INVITE_INVALID");
    });

    it("rejects accepting an expired invite with 410", async () => {
      const token = await createInvite();
      h.repo.invitations[0].expiresAt = new Date(Date.now() - 1000);

      const response = await request(h.app)
        .post("/v1/invitations/accept")
        .send({ token, name: "Alice", password: "StrongPass1" });

      expect(response.status).toBe(410);
      expect(response.body.code).toBe("INVITE_EXPIRED");
    });

    it("rejects acceptance when the seat limit is reached", async () => {
      const limited = makeApp(1);
      const tokenService = limited.tokens;
      await request(limited.app)
        .post("/v1/tenants/current/invitations")
        .send({ email: "alice@example.com", role: "USER" });
      const token = tokenService.generated[tokenService.generated.length - 1];
      limited.repo.memberships.push({
        id: "m1", userId: "u1", tenantId: TENANT_ID, role: "USER",
      });

      const response = await request(limited.app)
        .post("/v1/invitations/accept")
        .send({ token, name: "Alice", password: "StrongPass1" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("SEAT_LIMIT_REACHED");
      expect(limited.repo.users).toHaveLength(0);
    });

    it("rejects acceptance for a suspended tenant", async () => {
      const token = await createInvite();
      h.repo.tenants.set(TENANT_ID, { id: TENANT_ID, name: "Tenant One", isActive: false });

      const response = await request(h.app)
        .post("/v1/invitations/accept")
        .send({ token, name: "Alice", password: "StrongPass1" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("TENANT_SUSPENDED");
    });

    it("rejects a new-user accept when the email already has an account", async () => {
      h.repo.users.push({
        id: "user-alice", email: "alice@example.com", name: "Alice",
        isActive: true, passwordHash: "hash",
      });
      const token = await createInvite();

      const response = await request(h.app)
        .post("/v1/invitations/accept")
        .send({ token, name: "Alice", password: "StrongPass1" });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("ACCOUNT_EXISTS");
    });

    it("never writes a raw token to structured logs", async () => {
      const token = await createInvite();
      await request(h.app)
        .get("/v1/invitations/preview")
        .query({ token });
      await request(h.app)
        .post("/v1/invitations/accept")
        .send({ token, name: "Alice", password: "StrongPass1" });

      for (const line of h.logs) {
        expect(line).not.toContain(token);
        expect(line).not.toContain("alice@example.com");
      }
    });

    it("applies the public rate limiters", async () => {
      const token = await createInvite();
      await request(h.app).get("/v1/invitations/preview").query({ token });
      await request(h.app).post("/v1/invitations/accept").send({ token, name: "A", password: "StrongPass1" });

      // create (write limiter) + preview + accept = three limiter invocations.
      expect(h.limiterSpy).toHaveBeenCalledTimes(3);
    });

    it("validates request payloads", async () => {
      const invalidCreate = await request(h.app)
        .post("/v1/tenants/current/invitations")
        .send({ email: "not-an-email", role: "USER" });
      expect(invalidCreate.status).toBe(422);

      const missingToken = await request(h.app).get("/v1/invitations/preview");
      expect(missingToken.status).toBe(422);

      const weakAccept = await request(h.app)
        .post("/v1/invitations/accept")
        .send({ name: "Alice" });
      expect(weakAccept.status).toBe(422);
    });
  });
});
