import prisma from "../../../../shared/config/database/prisma";
import type { InviteStatus } from "@prisma/client";
import type {
  InviteRepository,
  CreateInviteData,
  InviteWithPlan,
} from "../../application/interfaces/invite-repository.interface";

export class PrismaInviteRepository implements InviteRepository {
  async create(data: CreateInviteData): Promise<InviteWithPlan> {
    return prisma.tenantInvite.create({
      data: {
        email: data.email.toLowerCase(),
        tenantName: data.tenantName,
        token: data.token,
        planId: data.planId,
        invitedBy: data.invitedBy,
        expiresAt: data.expiresAt,
      },
      include: { plan: true },
    });
  }

  async findById(id: string): Promise<InviteWithPlan | null> {
    return prisma.tenantInvite.findUnique({
      where: { id },
      include: { plan: true },
    });
  }

  async findByToken(token: string) {
    return prisma.tenantInvite.findUnique({
      where: { token },
      include: {
        plan: {
          include: {
            versions: {
              where: { status: "PUBLISHED" },
              orderBy: { version: "desc" },
              take: 1,
            },
          },
        },
      },
    });
  }
  async list(status?: InviteStatus): Promise<InviteWithPlan[]> {
    return prisma.tenantInvite.findMany({
      where: status ? { status } : undefined,
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async markAccepted(id: string): Promise<void> {
    await prisma.tenantInvite.update({
      where: { id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
  }

  async markRevoked(id: string): Promise<void> {
    await prisma.tenantInvite.update({
      where: { id },
      data: { status: "REVOKED" },
    });
  }

  async bumpResend(
    id: string,
    newToken: string,
    newExpiresAt: Date,
  ): Promise<InviteWithPlan> {
    return prisma.tenantInvite.update({
      where: { id },
      data: {
        token: newToken,
        expiresAt: newExpiresAt,
        resendCount: { increment: 1 },
        lastResentAt: new Date(),
        status: "PENDING",
      },
      include: { plan: true },
    });
  }
}
