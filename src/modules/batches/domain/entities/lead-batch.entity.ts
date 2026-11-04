// modules/batches/domain/entities/lead-batch.entity.ts

import type { BatchStatus, VoiceProvider } from "@prisma/client";
import { InvalidBatchStatusTransitionError } from "../errors/batch.errors";
import {
  canTransitionBatchStatus,
  isBatchActive,
  isBatchTerminal,
} from "./batch-status.rules";
import { type RetryConfig } from "../../../../shared/types/bolna.types";

export interface LeadBatchEntityData {
  id: string;
  name: string | null;
  provider?: VoiceProvider | null;
  bolnaBatchId: string | null;
  sarvamCohortId?: string | null;
  sarvamStatus?: string | null;
  cohortResult?: Record<string, unknown> | null;
  tenantId: string;
  campaignId: string;
  status: BatchStatus;
  fileName: string | null;
  originalFileUrl: string | null;
  transformedCsvUrl: string | null;
  retryConfig?: RetryConfig;
  scheduledAt: Date | null;
  bolnaScheduledAt: Date | null;
  totalLeads: number;
  calledLeads: number;
  completedLeads: number;
  failedLeads: number;
  termsAccepted: boolean;
  termsAcceptedAt: Date | null;
  termsVersion: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  processingStage?: string | null;
  processingProgress?: number;
  processingError?: string | null;
  rawFileUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
}

export class LeadBatchEntity {
  constructor(private readonly data: LeadBatchEntityData) {}

  get id(): string {
    return this.data.id;
  }
  get name(): string | null {
    return this.data.name;
  }
  get provider(): VoiceProvider {
    return this.data.provider ?? "BOLNA";
  }
  get status(): BatchStatus {
    return this.data.status;
  }
  get bolnaBatchId(): string | null {
    return this.data.bolnaBatchId;
  }
  get sarvamCohortId(): string | null {
    return this.data.sarvamCohortId ?? null;
  }
  get sarvamStatus(): string | null {
    return this.data.sarvamStatus ?? null;
  }
  get cohortResult(): Record<string, unknown> | null {
    return this.data.cohortResult ?? null;
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
  get isDeleted(): boolean {
    return this.data.isDeleted;
  }
  get deletedAt(): Date | null {
    return this.data.deletedAt;
  }

  /**
   * Only non-active, non-processing batches can be archived.
   * RUNNING, SCHEDULED, and PROCESSING batches must be stopped first.
   */
  get isArchivable(): boolean {
    return !this.isActive && this.data.status !== "PROCESSING";
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
