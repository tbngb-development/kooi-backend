import type { BatchStatus } from "@prisma/client";
import { InvalidBatchStatusTransitionError } from "../errors/batch.errors";
import {
  canTransitionBatchStatus,
  isBatchActive,
  isBatchTerminal,
} from "./batch-status.rules";

export interface LeadBatchEntityData {
  id: string;
  bolnaBatchId: string | null;
  tenantId: string;
  campaignId: string;
  status: BatchStatus;
  fileName: string | null;
  originalFileUrl: string | null;
  transformedCsvUrl: string | null;
  retryConfig: Record<string, unknown> | null;
  scheduledAt: Date | null;
  bolnaScheduledAt: Date | null;
  totalLeads: number;
  calledLeads: number;
  completedLeads: number;
  failedLeads: number;
  createdAt: Date;
  updatedAt: Date;
}

export class LeadBatchEntity {
  constructor(private readonly data: LeadBatchEntityData) {}

  get id(): string {
    return this.data.id;
  }
  get status(): BatchStatus {
    return this.data.status;
  }
  get bolnaBatchId(): string | null {
    return this.data.bolnaBatchId;
  }
  get campaignId(): string {
    return this.data.campaignId;
  }
  get isActive(): boolean {
    return isBatchActive(this.data.status);
  }
  get isTerminal(): boolean {
    return isBatchTerminal(this.data.status);
  }

  canRun(): boolean {
    return this.data.status === "CREATED" && this.data.bolnaBatchId !== null;
  }

  canSchedule(): boolean {
    return this.data.status === "CREATED" && this.data.bolnaBatchId !== null;
  }

  canStop(): boolean {
    return this.data.status === "SCHEDULED" || this.data.status === "RUNNING";
  }

  canResume(): boolean {
    return this.data.status === "STOPPED";
  }

  canDelete(): boolean {
    return !isBatchActive(this.data.status);
  }

  canTransitionTo(newStatus: BatchStatus): boolean {
    return canTransitionBatchStatus(this.data.status, newStatus);
  }

  validateTransition(newStatus: BatchStatus): void {
    if (!this.canTransitionTo(newStatus)) {
      throw new InvalidBatchStatusTransitionError(this.data.status, newStatus);
    }
  }

  toPrimitives(): LeadBatchEntityData {
    return { ...this.data };
  }
}
