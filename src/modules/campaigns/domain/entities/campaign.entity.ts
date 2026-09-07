import type { CampaignStatus } from "@prisma/client";
import { InvalidCampaignStatusTransitionError } from "../errors/campaign.errors";
import { canTransitionCampaignStatus } from "./campaign-status.rules";

export interface CampaignEntityData {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  tenantId: string;
  assistantId: string;
  brochureId: string | null;
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
  get assistantId(): string {
    return this.data.assistantId;
  }
  get brochureId(): string | null {
    return this.data.brochureId;
  }
  get totalLeads(): number {
    return this.data.totalLeads;
  }
  get isTerminal(): boolean {
    return this.data.status === "COMPLETED" || this.data.status === "FAILED";
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
