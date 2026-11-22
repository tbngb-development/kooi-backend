import { Prisma, type InvitationStatus } from "@prisma/client";
import prisma from "../../../../shared/config/database/prisma";
import { NotFoundError } from "../../../../shared/errors/not-found.error";
import {
  AccountExistsError,
  AlreadyMemberError,
} from "../../domain/errors/invitation.errors";
import type {
  CreateInvitationInput,
  InvitationRecord,
} from "../../application/dto/invitation.dto";
import type {
  AddMemberInput,
  SeatLockContext,
} from "../../application/interfaces/tenant-membership.repository";
import type {
  CreateInvitedUserInput,
  InvitationLockContext,
  InvitationPreviewContext,
  InvitationRepository,
} from "../../application/interfaces/invitation.repository";

type Db = Prisma.TransactionClient;

/** Prisma implementation shared by invitation and membership ports. */
export class PrismaInvitationRepository implements InvitationRepository {
  async countActiveMembers(tenantId: string, db: Db = prisma): Promise<number> {
    return db.tenantUser.count({ where: { tenantId } });
  }

  async countPendingInvites(tenantId: string, db: Db = prisma): Promise<number> {
    return db.invitation.count({
      where: { tenantId, status: "PENDING", expiresAt: { gt: new Date() } },
    });
  }

  /**
   * Serialise capacity checks on the Tenant row. The lock is acquired before
   * any count, so concurrent invites/accepts for one tenant cannot both see a
   * free seat.
   */
  async withSeatLock<T>(
    tenantId: string,
    work: (ctx: SeatLockContext) => Promise<T>,
  ): Promise<T> {
    return this.withTenantLock(tenantId, (tx) => this.makeSeatContext(tenantId, tx), work);
  }

  /** Full lock context for invitation lifecycle operations. */
  async withInvitationLock<T>(
    tenantId: string,
    work: (ctx: InvitationLockContext) => Promise<T>,
  ): Promise<T> {
    return this.withTenantLock(tenantId, (tx) => this.makeInvitationContext(tenantId, tx), work);
  }

  private async withTenantLock<C, T>(
    tenantId: string,
    makeContext: (tx: Db) => C,
    work: (ctx: C) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Tenant" WHERE id = ${tenantId} FOR UPDATE
      `;
      if (locked.length === 0) throw new NotFoundError("Tenant");

      return work(makeContext(tx));
    });
  }

  private makeSeatContext(tenantId: string, tx: Db): SeatLockContext {
    return {
      countActiveMembers: () => this.countActiveMembers(tenantId, tx),
      countPendingInvites: () => this.countPendingInvites(tenantId, tx),
      addMember: (input) => this.addMember(tenantId, input, tx),
    };
  }

  private makeInvitationContext(tenantId: string, tx: Db): InvitationLockContext {
    return {
      ...this.makeSeatContext(tenantId, tx),
      findPendingByEmail: (email) => this.findPendingByEmail(tenantId, email, tx),
      findByTokenHash: (tokenHash) => this.findByTokenHash(tokenHash, tx),
      findById: (id) => this.findById(id, tx),
      create: (input) => this.create(input, tx),
      rotateToken: (id, tokenHash, expiresAt) =>
        this.rotateToken(id, tokenHash, expiresAt, tx),
      markRevoked: (id) => this.markRevoked(id, tx),
      markAccepted: (id, userId) => this.markAccepted(id, userId, tx),
      findUserByEmail: (email) => this.findUserByEmail(email, tx),
      createUser: (input) => this.createUser(input, tx),
      insertMembership: (input) => this.insertMembership(tenantId, input, tx),
      membershipExists: (userId, targetTenantId) =>
        this.membershipExists(userId, targetTenantId, tx),
      isTenantActive: () => this.isTenantActive(tenantId, tx),
    };
  }

  async addMember(
    tenantId: string,
    input: AddMemberInput,
    db: Db = prisma,
  ): Promise<void> {
    await this.insertMembership(tenantId, input, db);
  }

  private async insertMembership(
    tenantId: string,
    input: AddMemberInput,
    db: Db,
  ): Promise<{ id: string }> {
    try {
      return await db.tenantUser.create({
        data: { tenantId, userId: input.userId, role: input.role },
        select: { id: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AlreadyMemberError();
      throw error;
    }
  }

  async create(
    input: CreateInvitationInput,
    db: Db = prisma,
  ): Promise<InvitationRecord> {
    return db.invitation.create({ data: input });
  }

  async findById(id: string, db: Db = prisma): Promise<InvitationRecord | null> {
    return db.invitation.findUnique({ where: { id } });
  }

  async findByTokenHash(
    tokenHash: string,
    db: Db = prisma,
  ): Promise<InvitationRecord | null> {
    return db.invitation.findUnique({ where: { tokenHash } });
  }

  async findPendingByEmail(
    tenantId: string,
    email: string,
    db: Db = prisma,
  ): Promise<InvitationRecord | null> {
    return db.invitation.findFirst({
      where: {
        tenantId,
        email: { equals: email, mode: "insensitive" },
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });
  }

  async listByTenant(
    tenantId: string,
    status?: InvitationStatus,
  ): Promise<InvitationRecord[]> {
    return prisma.invitation.findMany({
      where: { tenantId, ...(status && { status }) },
      orderBy: { createdAt: "desc" },
    });
  }

  async markAccepted(id: string, userId: string, db: Db = prisma): Promise<void> {
    await db.invitation.update({
      where: { id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        acceptedByUserId: userId,
      },
    });
  }

  async markRevoked(id: string, db: Db = prisma): Promise<void> {
    await db.invitation.update({
      where: { id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
  }

  async markExpired(id: string, db: Db = prisma): Promise<void> {
    await db.invitation.update({
      where: { id },
      data: { status: "EXPIRED" },
    });
  }

  async touchSent(id: string, db: Db = prisma): Promise<void> {
    await db.invitation.update({
      where: { id },
      data: { lastSentAt: new Date(), sendCount: { increment: 1 } },
    });
  }

  async rotateToken(
    id: string,
    tokenHash: string,
    expiresAt: Date,
    db: Db = prisma,
  ): Promise<InvitationRecord> {
    return db.invitation.update({
      where: { id },
      data: {
        tokenHash,
        expiresAt,
        status: "PENDING",
        revokedAt: null,
        lastSentAt: new Date(),
        sendCount: { increment: 1 },
      },
    });
  }

  async findPreviewContext(
    invitationId: string,
  ): Promise<InvitationPreviewContext | null> {
    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { tenant: { select: { name: true, isActive: true } } },
    });
    if (!invitation) return null;

    const inviter = await prisma.user.findUnique({
      where: { id: invitation.invitedById },
      select: { name: true },
    });

    return {
      tenantName: invitation.tenant.name,
      tenantIsActive: invitation.tenant.isActive,
      inviterName: inviter?.name ?? "A teammate",
    };
  }

  async expireStale(now: Date): Promise<number> {
    const result = await prisma.invitation.updateMany({
      where: { status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
    });
    return result.count;
  }

  private async findUserByEmail(
    email: string,
    db: Db,
  ): Promise<{ id: string; email: string; isActive: boolean } | null> {
    return db.user.findUnique({
      where: { email },
      select: { id: true, email: true, isActive: true },
    });
  }

  private async createUser(
    input: CreateInvitedUserInput,
    db: Db,
  ): Promise<{ id: string; email: string }> {
    try {
      return await db.user.create({
        data: {
          email: input.email,
          name: input.name,
          password: input.passwordHash,
        },
        select: { id: true, email: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AccountExistsError();
      throw error;
    }
  }

  private async membershipExists(
    userId: string,
    tenantId: string,
    db: Db,
  ): Promise<boolean> {
    const membership = await db.tenantUser.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { id: true },
    });
    return membership !== null;
  }

  private async isTenantActive(tenantId: string, db: Db): Promise<boolean> {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { isActive: true },
    });
    return tenant?.isActive ?? false;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
