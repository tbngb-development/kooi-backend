import prisma from "../../../../shared/config/database/prisma";
import type { Prisma } from "@prisma/client";
import type {
  InboundNumberRepository,
  CreateInboundNumberData,
  UpdateInboundNumberData,
  CreateRentalHistoryData,
} from "../../application/interfaces/inbound-number-repository.interface";
import type {
  ListInboundNumbersFilters,
  InboundNumberListItemDTO,
  InboundNumberDetailDTO,
} from "../../application/dto/inbound-number.dto";

const inboundNumberListSelect = {
  id: true,
  phoneNumber: true,
  bolnaPhoneNumberId: true,
  provider: true,
  status: true,
  providerSyncStatus: true,
  providerSyncError: true,
  monthlyRentalPaisa: true,
  tenantId: true,
  assistantId: true,
  bolnaApiKeyId: true,
  assignedAt: true,
  suspendedAt: true,
  lastBilledAt: true,
  nextBillingAt: true,
  isDeleted: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  tenant: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  assistant: {
    select: {
      id: true,
      name: true,
      platformAgentId: true,
    },
  },
} as const;

export class PrismaInboundNumberRepository implements InboundNumberRepository {
  async findById(id: string): Promise<InboundNumberDetailDTO | null> {
    const record = await prisma.inboundNumber.findUnique({
      where: { id },
      select: {
        ...inboundNumberListSelect,
        rentalHistory: {
          select: {
            id: true,
            amountPaisa: true,
            periodStart: true,
            periodEnd: true,
            status: true,
            walletTxId: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    return record as InboundNumberDetailDTO | null;
  }

  async findByPhoneNumber(
    phoneNumber: string,
  ): Promise<InboundNumberListItemDTO | null> {
    const record = await prisma.inboundNumber.findUnique({
      where: { phoneNumber },
      select: inboundNumberListSelect,
    });

    return record as InboundNumberListItemDTO | null;
  }

  async findByBolnaPhoneNumberId(
    bolnaPhoneNumberId: string,
  ): Promise<InboundNumberListItemDTO | null> {
    const record = await prisma.inboundNumber.findUnique({
      where: { bolnaPhoneNumberId },
      select: inboundNumberListSelect,
    });

    return record as InboundNumberListItemDTO | null;
  }

  async list(
    filters: ListInboundNumbersFilters,
  ): Promise<{ items: InboundNumberListItemDTO[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.max(1, Math.min(100, filters.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.InboundNumberWhereInput = {
      isDeleted: false,
      ...(filters.status && { status: filters.status }),
      ...(filters.providerSyncStatus && {
        providerSyncStatus: filters.providerSyncStatus,
      }),
      ...(filters.tenantId && { tenantId: filters.tenantId }),
      ...(filters.assistantId && { assistantId: filters.assistantId }),
      ...(filters.search && {
        phoneNumber: {
          contains: filters.search.trim(),
          mode: "insensitive" as Prisma.QueryMode,
        },
      }),
    };

    const [items, total] = await Promise.all([
      prisma.inboundNumber.findMany({
        where,
        select: inboundNumberListSelect,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.inboundNumber.count({ where }),
    ]);

    return {
      items: items as InboundNumberListItemDTO[],
      total,
    };
  }

  async create(
    data: CreateInboundNumberData,
  ): Promise<InboundNumberListItemDTO> {
    const record = await prisma.inboundNumber.create({
      data: {
        phoneNumber: data.phoneNumber,
        bolnaPhoneNumberId: data.bolnaPhoneNumberId,
        provider: data.provider ?? "bolna",
        monthlyRentalPaisa: data.monthlyRentalPaisa ?? 0,
        bolnaApiKeyId: data.bolnaApiKeyId,
        status: "AVAILABLE",
        providerSyncStatus: "SYNCED",
      },
      select: inboundNumberListSelect,
    });

    return record as InboundNumberListItemDTO;
  }

  async update(
    id: string,
    data: UpdateInboundNumberData,
  ): Promise<InboundNumberListItemDTO> {
    const record = await prisma.inboundNumber.update({
      where: { id },
      data: {
        ...(data.status !== undefined && { status: data.status }),
        ...(data.providerSyncStatus !== undefined && {
          providerSyncStatus: data.providerSyncStatus,
        }),
        ...(data.providerSyncError !== undefined && {
          providerSyncError: data.providerSyncError,
        }),
        ...(data.tenantId !== undefined && { tenantId: data.tenantId }),
        ...(data.assistantId !== undefined && {
          assistantId: data.assistantId,
        }),
        ...(data.bolnaApiKeyId !== undefined && {
          bolnaApiKeyId: data.bolnaApiKeyId,
        }),
        ...(data.monthlyRentalPaisa !== undefined && {
          monthlyRentalPaisa: data.monthlyRentalPaisa,
        }),
        ...(data.assignedAt !== undefined && {
          assignedAt: data.assignedAt,
        }),
        ...(data.suspendedAt !== undefined && {
          suspendedAt: data.suspendedAt,
        }),
        ...(data.lastBilledAt !== undefined && {
          lastBilledAt: data.lastBilledAt,
        }),
        ...(data.nextBillingAt !== undefined && {
          nextBillingAt: data.nextBillingAt,
        }),
        ...(data.isDeleted !== undefined && { isDeleted: data.isDeleted }),
        ...(data.deletedAt !== undefined && { deletedAt: data.deletedAt }),
      },
      select: inboundNumberListSelect,
    });

    return record as InboundNumberListItemDTO;
  }

  async createRentalHistory(data: CreateRentalHistoryData): Promise<void> {
    await prisma.inboundNumberRentalHistory.create({
      data: {
        inboundNumberId: data.inboundNumberId,
        tenantId: data.tenantId,
        amountPaisa: data.amountPaisa,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        status: data.status,
        walletTxId: data.walletTxId,
      },
    });
  }

  async findDueForRentalBilling(
    now: Date,
  ): Promise<InboundNumberListItemDTO[]> {
    const records = await prisma.inboundNumber.findMany({
      where: {
        status: "ACTIVE",
        isDeleted: false,
        tenantId: { not: null },
        monthlyRentalPaisa: { gt: 0 },
        OR: [
          { nextBillingAt: { lte: now } },
          { nextBillingAt: null },
        ],
      },
      select: inboundNumberListSelect,
    });

    return records as InboundNumberListItemDTO[];
  }
}
