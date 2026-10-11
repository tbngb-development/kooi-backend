import type { QuickDialStatus } from "@prisma/client";

export interface InitiateQuickDialDTO {
  tenantId: string;
  userId: string;
  assistantId: string;
  recipientPhone: string;
  leadId?: string;
  fromPhoneNumber?: string;
  userData?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface QuickDialBatchContactInput {
  recipientPhone: string;
  leadId?: string;
  customerName?: string;
  userData?: Record<string, string>;
  metadata?: Record<string, unknown>;
}


export interface InitiateBatchQuickDialDTO {
  tenantId: string;
  userId: string;
  assistantId: string;
  fromPhoneNumber?: string;
  contacts: QuickDialBatchContactInput[];
}

export interface BatchQuickDialContactResult {
  recipientPhone: string;
  normalizedPhone?: string;
  leadId?: string | null;
  customerName?: string;
  success: boolean;
  jobId?: string;
  bolnaExecutionId?: string;
  error?: string;
}

export interface BatchQuickDialResultDTO {
  totalRequested: number;
  initiatedCount: number;
  failedCount: number;
  results: BatchQuickDialContactResult[];
}


export interface QuickDialJobDTO {
  id: string;
  tenantId: string;
  userId: string;
  assistantId: string;
  leadId: string | null;
  recipientPhone: string;
  status: QuickDialStatus;
  bolnaExecutionId: string | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  call?: {
    id: string;
    status: string;
    duration: number | null;
    recording: string | null;
    cost: number | null;
    platformCost: number | null;
    startedAt: Date | null;
    endedAt: Date | null;
  } | null;
  assistant?: {
    id: string;
    name: string;
  } | null;
  lead?: {
    id: string;
    name: string | null;
    phone: string;
  } | null;
}

export interface ListQuickDialJobsFilters {
  tenantId: string;
  assistantId?: string;
  status?: QuickDialStatus;
  search?: string;
  page?: number;
  limit?: number;
}
