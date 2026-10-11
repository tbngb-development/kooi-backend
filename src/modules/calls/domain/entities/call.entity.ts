// modules/calls/domain/entities/call.entity.ts

import { type CallStatus, type CallSource } from "@prisma/client";

export interface CallEntityData {
  id: string;
  bolnaCallId: string | null;
  tenantId: string;
  campaignId: string | null;
  leadId: string | null;
  batchId: string | null;
  assistantId?: string | null;
  inboundNumberId?: string | null;
  quickDialJobId?: string | null;
  source?: CallSource;
  status: CallStatus;
  duration: number | null;
  cost: number | null;
  platformCost: number | null;
  billableSeconds: number | null;
  recording: string | null;
  transcript: string | null;
  transcriptMessages: unknown | null;
  summary: string | null;
  callHistory: unknown | null;
  extractionResult: Record<string, any> | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
}

export class CallEntity {
  constructor(private readonly data: CallEntityData) {}

  get id(): string {
    return this.data.id;
  }
  get bolnaCallId(): string | null {
    return this.data.bolnaCallId;
  }
  get tenantId(): string {
    return this.data.tenantId;
  }
  get campaignId(): string | null {
    return this.data.campaignId;
  }
  get leadId(): string | null {
    return this.data.leadId;
  }
  get source(): CallSource {
    return this.data.source ?? "CAMPAIGN";
  }
  get assistantId(): string | null | undefined {
    return this.data.assistantId;
  }
  get inboundNumberId(): string | null | undefined {
    return this.data.inboundNumberId;
  }
  get quickDialJobId(): string | null | undefined {
    return this.data.quickDialJobId;
  }
  get status(): CallStatus {
    return this.data.status;
  }
  get duration(): number | null {
    return this.data.duration;
  }
  get cost(): number | null {
    return this.data.cost;
  }
  get ourCostPaisa(): number | null {
    return this.data.platformCost;
  }
  get billableSeconds(): number | null {
    return this.data.billableSeconds;
  }
  get isDeleted(): boolean {
    return this.data.isDeleted;
  }
  get deletedAt(): Date | null {
    return this.data.deletedAt;
  }

  toPrimitives(): CallEntityData {
    return { ...this.data };
  }
}
