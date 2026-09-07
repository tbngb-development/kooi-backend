import { type TenantRole } from "@prisma/client";

export interface TenantMemberData {
  id: string; // User.id
  email: string; // User.email
  name: string; // User.name
  role: TenantRole; // TenantUser.role
  createdAt: Date; // TenantUser.createdAt
}

export class TenantMemberEntity {
  constructor(private readonly data: TenantMemberData) {}

  get id(): string {
    return this.data.id;
  }
  get email(): string {
    return this.data.email;
  }
  get name(): string {
    return this.data.name;
  }
  get role(): TenantRole {
    return this.data.role;
  }

  toPrimitives(): TenantMemberData {
    return { ...this.data };
  }
}