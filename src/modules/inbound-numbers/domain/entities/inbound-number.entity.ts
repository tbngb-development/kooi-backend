import type {
  InboundNumberStatus,
  ProviderSyncStatus,
} from "@prisma/client";

export interface InboundNumberData {
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
}

export class InboundNumberEntity {
  constructor(private readonly data: InboundNumberData) {}

  get id(): string {
    return this.data.id;
  }
  get phoneNumber(): string {
    return this.data.phoneNumber;
  }
  get bolnaPhoneNumberId(): string {
    return this.data.bolnaPhoneNumberId;
  }
  get provider(): string {
    return this.data.provider;
  }
  get status(): InboundNumberStatus {
    return this.data.status;
  }
  get providerSyncStatus(): ProviderSyncStatus {
    return this.data.providerSyncStatus;
  }
  get providerSyncError(): string | null {
    return this.data.providerSyncError;
  }
  get monthlyRentalPaisa(): number {
    return this.data.monthlyRentalPaisa;
  }
  get tenantId(): string | null {
    return this.data.tenantId;
  }
  get assistantId(): string | null {
    return this.data.assistantId;
  }
  get bolnaApiKeyId(): string | null {
    return this.data.bolnaApiKeyId;
  }
  get assignedAt(): Date | null {
    return this.data.assignedAt;
  }
  get suspendedAt(): Date | null {
    return this.data.suspendedAt;
  }
  get lastBilledAt(): Date | null {
    return this.data.lastBilledAt;
  }
  get nextBillingAt(): Date | null {
    return this.data.nextBillingAt;
  }
  get isDeleted(): boolean {
    return this.data.isDeleted;
  }
  get deletedAt(): Date | null {
    return this.data.deletedAt;
  }
  get createdAt(): Date {
    return this.data.createdAt;
  }
  get updatedAt(): Date {
    return this.data.updatedAt;
  }

  canAssign(): boolean {
    return this.data.status === "AVAILABLE" || this.data.status === "RELEASED";
  }

  canSuspend(): boolean {
    return this.data.status === "ACTIVE";
  }

  canReactivate(): boolean {
    return this.data.status === "SUSPENDED";
  }

  canRelease(): boolean {
    return this.data.status === "ACTIVE" || this.data.status === "SUSPENDED";
  }

  toPrimitives(): InboundNumberData {
    return { ...this.data };
  }
}
