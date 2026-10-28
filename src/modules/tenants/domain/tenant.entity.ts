export interface TenantEntityData {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  isVerified?: boolean;
  phone?: string | null;
  verifiedAt?: Date | null;
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
  get isVerified(): boolean {
    return this.data.isVerified ?? false;
  }
  get phone(): string | null | undefined {
    return this.data.phone;
  }
  get verifiedAt(): Date | null | undefined {
    return this.data.verifiedAt;
  }

  toPrimitives(): TenantEntityData {
    return { ...this.data };
  }
}