import type {
  InboundNumberStatus,
  ProviderSyncStatus,
  RentalBillingStatus,
} from "@prisma/client";

export interface ImportInboundNumbersDTO {
  bolnaApiKeyId?: string;
}

export interface CreateCustomInboundNumberDTO {
  phoneNumber: string;
  provider: string; // "vobiz", "twilio", "plivo", "custom", etc.
  providerNumberId?: string;
  monthlyRentalPaisa?: number;
}

export interface ImportInboundNumbersResult {
  importedCount: number;
  skippedCount: number;
  totalFound: number;
  numbers: Array<{
    phoneNumber: string;
    bolnaPhoneNumberId: string;
    status: InboundNumberStatus;
  }>;
}

export interface AssignInboundNumberDTO {
  inboundNumberId: string;
  tenantId: string;
  assistantId: string;
  monthlyRentalPaisa?: number;
}

export interface SuspendInboundNumberDTO {
  inboundNumberId: string;
  reason?: string;
}

export interface ReactivateInboundNumberDTO {
  inboundNumberId: string;
}

export interface ReleaseInboundNumberDTO {
  inboundNumberId: string;
}

export interface RetryProviderSyncDTO {
  inboundNumberId: string;
}

export interface ListInboundNumbersFilters {
  status?: InboundNumberStatus;
  providerSyncStatus?: ProviderSyncStatus;
  tenantId?: string;
  assistantId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface InboundNumberListItemDTO {
  id: string;
  phoneNumber: string;
  bolnaPhoneNumberId: string;
  provider: string;
  status: InboundNumberStatus;
  providerSyncStatus: ProviderSyncStatus;
  providerSyncError: string | null;
  monthlyRentalPaisa: number;
  tenantId: string | null;
  assistantId: string | null;
  bolnaApiKeyId: string | null;
  assignedAt: Date | null;
  suspendedAt: Date | null;
  lastBilledAt: Date | null;
  nextBillingAt: Date | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tenant?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  assistant?: {
    id: string;
    name: string;
    platformAgentId: string;
  } | null;
}

export interface InboundNumberDetailDTO extends InboundNumberListItemDTO {
  rentalHistory: Array<{
    id: string;
    amountPaisa: number;
    periodStart: Date;
    periodEnd: Date;
    status: RentalBillingStatus;
    walletTxId: string | null;
    createdAt: Date;
  }>;
}

export interface BillInboundNumberRentalsResult {
  processed: number;
  successful: number;
  failed: number;
  suspended: number;
  details: Array<{
    inboundNumberId: string;
    tenantId: string;
    amountPaisa: number;
    status: "SUCCESS" | "FAILED" | "SUSPENDED";
    error?: string;
  }>;
}
