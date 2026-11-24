// modules/campaigns/domain/entities/campaign.entity.ts

import type { CampaignStatus, VoiceProvider } from "@prisma/client";
import { InvalidCampaignStatusTransitionError } from "../errors/campaign.errors";
import { canTransitionCampaignStatus } from "./campaign-status.rules";

export interface CampaignEntityData {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  tenantId: string;
  assistantId?: string | null;
  sarvamAgentId?: string | null;
  provider?: VoiceProvider | null;
  sarvamCampaignId?: string | null;
  sarvamStatus?: string | null;
  startTimestamp?: Date | null;
  endTimestamp?: Date | null;
  allowedSchedule?: Record<string, unknown> | null;
  variables: Record<string, string> | null;
  defaultRetryConfig: Record<string, unknown> | null;
  totalLeads: number;
  calledLeads: number;
  completedLeads: number;
  failedLeads: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
}

export class CampaignEntity {
  constructor(private readonly data: CampaignEntityData) {}

  get id(): string {
    return this.data.id;
  }
  get status(): CampaignStatus {
    return this.data.status;
  }
  get tenantId(): string {
    return this.data.tenantId;
  }
  get assistantId(): string | null {
    return this.data.assistantId ?? null;
  }
  get sarvamAgentId(): string | null {
    return this.data.sarvamAgentId ?? null;
  }
  get provider(): VoiceProvider {
    return this.data.provider ?? "BOLNA";
  }
  get sarvamCampaignId(): string | null {
    return this.data.sarvamCampaignId ?? null;
  }
  get sarvamStatus(): string | null {
    return this.data.sarvamStatus ?? null;
  }
  get startTimestamp(): Date | null {
    return this.data.startTimestamp ?? null;
  }
  get endTimestamp(): Date | null {
    return this.data.endTimestamp ?? null;
  }
  get allowedSchedule(): Record<string, unknown> | null {
    return this.data.allowedSchedule ?? null;
  }
  get totalLeads(): number {
    return this.data.totalLeads;
  }
  get isDeleted(): boolean {
    return this.data.isDeleted;
  }
  get deletedAt(): Date | null {
    return this.data.deletedAt;
  }
  get isTerminal(): boolean {
    return (
      this.data.status === "COMPLETED" ||
      this.data.status === "FAILED" ||
      this.data.status === "CANCELLED"
    );
  }

  get isDraft(): boolean {
    return this.data.status === "DRAFT";
  }

  /**
   * Only campaigns in DRAFT, SCHEDULED, COMPLETED, CANCELLED, or FAILED statuses are allowed to be archived.
   * RUNNING campaigns cannot be archived.
   */
  get isArchivable(): boolean {
    return (
      this.data.status === "DRAFT" ||
      this.data.status === "SCHEDULED" ||
      this.data.status === "PAUSED" ||
      this.data.status === "COMPLETED" ||
      this.data.status === "CANCELLED" ||
      this.data.status === "FAILED"
    );
  }

  canTransitionTo(newStatus: CampaignStatus): boolean {
    return canTransitionCampaignStatus(this.data.status, newStatus);
  }

  validateTransition(newStatus: CampaignStatus): void {
    if (!this.canTransitionTo(newStatus)) {
      throw new InvalidCampaignStatusTransitionError(
        this.data.status,
        newStatus,
      );
    }
  }

  toPrimitives(): CampaignEntityData {
    return { ...this.data };
  }
}
