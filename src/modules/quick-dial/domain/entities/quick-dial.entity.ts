import type { QuickDialStatus } from "@prisma/client";

export interface QuickDialJobData {
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
}

export class QuickDialJobEntity {
  constructor(private readonly data: QuickDialJobData) {}

  get id(): string {
    return this.data.id;
  }

  get tenantId(): string {
    return this.data.tenantId;
  }

  get userId(): string {
    return this.data.userId;
  }

  get assistantId(): string {
    return this.data.assistantId;
  }

  get leadId(): string | null {
    return this.data.leadId;
  }

  get recipientPhone(): string {
    return this.data.recipientPhone;
  }

  get status(): QuickDialStatus {
    return this.data.status;
  }

  get bolnaExecutionId(): string | null {
    return this.data.bolnaExecutionId;
  }

  get error(): string | null {
    return this.data.error;
  }

  get metadata(): Record<string, unknown> | null {
    return this.data.metadata;
  }

  get createdAt(): Date {
    return this.data.createdAt;
  }

  get updatedAt(): Date {
    return this.data.updatedAt;
  }

  isTerminal(): boolean {
    return (
      this.data.status === "COMPLETED" ||
      this.data.status === "FAILED" ||
      this.data.status === "CANCELLED"
    );
  }
}
