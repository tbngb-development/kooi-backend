import type { QuickDialStatus } from "@prisma/client";
import type { QuickDialJobEntity } from "../../domain/entities/quick-dial.entity";
import type {
  QuickDialJobDTO,
  ListQuickDialJobsFilters,
} from "../dto/quick-dial.dto";

export interface CreateQuickDialJobData {
  tenantId: string;
  userId: string;
  assistantId: string;
  leadId?: string | null;
  recipientPhone: string;
  status: QuickDialStatus;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateQuickDialJobData {
  status?: QuickDialStatus;
  bolnaExecutionId?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface QuickDialRepository {
  createJob(data: CreateQuickDialJobData): Promise<QuickDialJobEntity>;
  updateJob(id: string, data: UpdateQuickDialJobData): Promise<QuickDialJobEntity>;
  findById(tenantId: string, id: string): Promise<QuickDialJobDTO | null>;
  findByExecutionId(executionId: string): Promise<QuickDialJobEntity | null>;
  listJobs(filters: ListQuickDialJobsFilters): Promise<{
    items: QuickDialJobDTO[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  createCallForJob(data: {
    bolnaCallId: string;
    tenantId: string;
    assistantId: string;
    leadId?: string | null;
    quickDialJobId: string;
  }): Promise<{ id: string }>;
}
