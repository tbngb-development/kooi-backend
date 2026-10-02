import { type LeadStatus } from "@prisma/client";

export interface LeadEntityData {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
  status: LeadStatus;
  doNotCall: boolean;
  tenantId: string;
  campaignId: string;
  batchId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export class LeadEntity {
  constructor(private readonly data: LeadEntityData) {}

  get id(): string {
    return this.data.id;
  }
  get name(): string | null {
    return this.data.name;
  }
  get phone(): string {
    return this.data.phone;
  }
  get status(): LeadStatus {
    return this.data.status;
  }
  get doNotCall(): boolean {
    return this.data.doNotCall;
  }
  get tenantId(): string {
    return this.data.tenantId;
  }
  get campaignId(): string {
    return this.data.campaignId;
  }

  toPrimitives(): LeadEntityData {
    return { ...this.data };
  }
}