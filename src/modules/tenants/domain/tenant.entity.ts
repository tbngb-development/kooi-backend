export interface TenantEntityData {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
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