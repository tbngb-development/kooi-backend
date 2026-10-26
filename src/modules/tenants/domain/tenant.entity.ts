export interface TenantEntityData {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  suspensionReason?: string | null;
  suspendedAt?: Date | null;
  suspendedBy?: string | null;
  termsAccepted?: boolean;
  termsAcceptedAt?: Date | null;
  termsVersion?: string | null;
  workspaceSwitchStatus?: string;
  workspaceSwitchError?: string | null;
  bolnaApiKeyId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class TenantEntity {
  constructor(private readonly data: TenantEntityData) {}

  get id(): string {
    return this.data.id;
  }
  get name(): string {
    return this.data.name;
  }
  get email(): string {
    return this.data.email;
  }
  get isActive(): boolean {
    return this.data.isActive;
  }

  toPrimitives(): TenantEntityData {
    return { ...this.data };
  }
}