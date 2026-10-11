import type {
  InboundNumberStatus,
  ProviderSyncStatus,
  RentalBillingStatus,
} from "@prisma/client";
import type {
  ListInboundNumbersFilters,
  InboundNumberListItemDTO,
  InboundNumberDetailDTO,
} from "../dto/inbound-number.dto";

export interface CreateInboundNumberData {
  phoneNumber: string;
  bolnaPhoneNumberId: string;
  provider?: string;
  monthlyRentalPaisa?: number;
  bolnaApiKeyId?: string | null;
}

export interface UpdateInboundNumberData {
  status?: InboundNumberStatus;
  providerSyncStatus?: ProviderSyncStatus;
  providerSyncError?: string | null;
  tenantId?: string | null;
  assistantId?: string | null;
  bolnaApiKeyId?: string | null;
  monthlyRentalPaisa?: number;
  assignedAt?: Date | null;
  suspendedAt?: Date | null;
  lastBilledAt?: Date | null;
  nextBillingAt?: Date | null;
  isDeleted?: boolean;
  deletedAt?: Date | null;
}

export interface CreateRentalHistoryData {
  inboundNumberId: string;
  tenantId: string;
  amountPaisa: number;
  periodStart: Date;
  periodEnd: Date;
  status: RentalBillingStatus;
  walletTxId?: string | null;
}

export interface InboundNumberRepository {
  findById(id: string): Promise<InboundNumberDetailDTO | null>;
  findByPhoneNumber(phoneNumber: string): Promise<InboundNumberListItemDTO | null>;
  findByBolnaPhoneNumberId(bolnaPhoneNumberId: string): Promise<InboundNumberListItemDTO | null>;
  list(filters: ListInboundNumbersFilters): Promise<{ items: InboundNumberListItemDTO[]; total: number }>;
  create(data: CreateInboundNumberData): Promise<InboundNumberListItemDTO>;
  update(id: string, data: UpdateInboundNumberData): Promise<InboundNumberListItemDTO>;
  createRentalHistory(data: CreateRentalHistoryData): Promise<void>;
  findDueForRentalBilling(now: Date): Promise<InboundNumberListItemDTO[]>;
}
