import { type CallStatus } from "@prisma/client";

export interface CallEntityData {
  id: string;
  bolnaCallId: string | null;
  tenantId: string;
  campaignId: string;
  leadId: string;
  batchId: string | null;
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
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  get campaignId(): string {
    return this.data.campaignId;
  }
  get leadId(): string {
    return this.data.leadId;
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

  toPrimitives(): CallEntityData {
    return { ...this.data };
  }
}
