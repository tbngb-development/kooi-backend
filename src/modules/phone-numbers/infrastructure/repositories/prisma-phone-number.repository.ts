import type { Prisma } from "@prisma/client";
import prisma from "../../../../shared/config/database/prisma";
import type { IPhoneNumberRepository } from "../../application/interfaces/phone-number-repository.interface";
import type {
  CreatePhoneNumberDto,
  UpdatePhoneNumberDto,
  AssignPhoneNumberDto,
  PhoneNumberFilterDto,
  PhoneNumberDetailDto,
  TenantInboundAssistantDto,
} from "../../application/dto/phone-number.dto";

const phoneInclude = {
  tenant: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  assistant: {
    select: {
      id: true,
      name: true,
      platformAgent: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
  },
} as const;

export class PrismaPhoneNumberRepository implements IPhoneNumberRepository {
  private format(item: any): PhoneNumberDetailDto {
    return {
      id: item.id,
      phoneNumber: item.phoneNumber,
      friendlyName: item.friendlyName,
      provider: item.provider,
      status: item.status,
      capabilities: item.capabilities,
      tenantId: item.tenantId,
      assistantId: item.assistantId,
      tenant: item.tenant ?? null,
      assistant: item.assistant ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  async create(
    dto: CreatePhoneNumberDto & { normalizedPhone: string },
  ): Promise<PhoneNumberDetailDto> {
    const created = await prisma.phoneNumber.create({
      data: {
        phoneNumber: dto.normalizedPhone,
        friendlyName: dto.friendlyName?.trim() || null,
        provider: dto.provider ?? "BOLNA",
        capabilities: dto.capabilities ?? "BOTH",
        status: dto.status ?? "ACTIVE",
        tenantId: dto.tenantId || null,
        assistantId: dto.assistantId || null,
      },
      include: phoneInclude,
    });

    return this.format(created);
  }

  async findById(id: string): Promise<PhoneNumberDetailDto | null> {
    const item = await prisma.phoneNumber.findUnique({
      where: { id },
      include: phoneInclude,
    });
    return item ? this.format(item) : null;
  }

  async findByPhoneNumber(
    phoneNumber: string,
  ): Promise<PhoneNumberDetailDto | null> {
    const item = await prisma.phoneNumber.findUnique({
      where: { phoneNumber },
      include: phoneInclude,
    });
    return item ? this.format(item) : null;
  }

  async findFirstByTenantId(
    tenantId: string,
  ): Promise<PhoneNumberDetailDto | null> {
    const item = await prisma.phoneNumber.findFirst({
      where: { tenantId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: phoneInclude,
    });
    return item ? this.format(item) : null;
  }

  async findByTenantId(tenantId: string): Promise<PhoneNumberDetailDto[]> {
    const items = await prisma.phoneNumber.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: phoneInclude,
    });
    return items.map((i) => this.format(i));
  }

  async list(filter: PhoneNumberFilterDto): Promise<{
    phoneNumbers: PhoneNumberDetailDto[];
    total: number;
    stats: {
      total: number;
      assigned: number;
      available: number;
      active: number;
    };
  }> {
    const page = Math.max(Number(filter.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filter.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const where: Prisma.PhoneNumberWhereInput = {};

    if (filter.search?.trim()) {
      const term = filter.search.trim();
      where.OR = [
        { phoneNumber: { contains: term, mode: "insensitive" } },
        { friendlyName: { contains: term, mode: "insensitive" } },
      ];
    }

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.provider) {
      where.provider = filter.provider;
    }

    if (filter.capabilities) {
      where.capabilities = filter.capabilities;
    }

    if (filter.isAssigned !== undefined) {
      where.tenantId = filter.isAssigned ? { not: null } : null;
    }

    if (filter.tenantId) {
      where.tenantId = filter.tenantId;
    }

    const [items, total, statTotal, statAssigned, statAvailable, statActive] =
      await Promise.all([
        prisma.phoneNumber.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: phoneInclude,
        }),
        prisma.phoneNumber.count({ where }),
        prisma.phoneNumber.count(),
        prisma.phoneNumber.count({ where: { tenantId: { not: null } } }),
        prisma.phoneNumber.count({
          where: { tenantId: null, status: "ACTIVE" },
        }),
        prisma.phoneNumber.count({ where: { status: "ACTIVE" } }),
      ]);

    return {
      phoneNumbers: items.map((i) => this.format(i)),
      total,
      stats: {
        total: statTotal,
        assigned: statAssigned,
        available: statAvailable,
        active: statActive,
      },
    };
  }

  async update(
    id: string,
    dto: UpdatePhoneNumberDto,
  ): Promise<PhoneNumberDetailDto> {
    const updated = await prisma.phoneNumber.update({
      where: { id },
      data: {
        ...(dto.friendlyName !== undefined
          ? { friendlyName: dto.friendlyName?.trim() || null }
          : {}),
        ...(dto.provider ? { provider: dto.provider } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.capabilities ? { capabilities: dto.capabilities } : {}),
      },
      include: phoneInclude,
    });
    return this.format(updated);
  }

  async assign(
    id: string,
    dto: AssignPhoneNumberDto,
  ): Promise<PhoneNumberDetailDto> {
    const updated = await prisma.phoneNumber.update({
      where: { id },
      data: {
        tenantId: dto.tenantId,
        assistantId: dto.assistantId ?? null,
      },
      include: phoneInclude,
    });
    return this.format(updated);
  }

  async unassign(id: string): Promise<PhoneNumberDetailDto> {
    const updated = await prisma.phoneNumber.update({
      where: { id },
      data: {
        tenantId: null,
        assistantId: null,
      },
      include: phoneInclude,
    });
    return this.format(updated);
  }

  async delete(id: string): Promise<void> {
    await prisma.phoneNumber.delete({ where: { id } });
  }

  async countCallsByPhoneNumber(phoneNumber: string): Promise<number> {
    return prisma.call.count({
      where: {
        agentNumber: phoneNumber,
        isDeleted: false,
      },
    });
  }

  async getTenantInboundAssistants(
    tenantId: string,
  ): Promise<TenantInboundAssistantDto[]> {
    const assistants = await prisma.assistant.findMany({
      where: {
        tenantId,
        isDeleted: false,
        platformAgent: {
          type: { in: ["INBOUND", "BOTH"] },
        },
      },
      include: {
        platformAgent: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return assistants.map((a) => ({
      id: a.id,
      name: a.name,
      platformAgentName: a.platformAgent?.name,
      platformAgentType: a.platformAgent?.type,
    }));
  }

  async checkTenantExists(tenantId: string): Promise<boolean> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    return Boolean(tenant);
  }

  async checkAssistantBelongsToTenant(
    assistantId: string,
    tenantId: string,
  ): Promise<boolean> {
    const assistant = await prisma.assistant.findFirst({
      where: {
        id: assistantId,
        tenantId,
        isDeleted: false,
      },
      select: { id: true },
    });
    return Boolean(assistant);
  }
}
