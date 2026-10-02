import { type TenantRole } from "@prisma/client";
import { type TenantMemberData } from "../../domain/entities/tenant-member.entity";

export interface CreateUserData {
  email: string;
  name: string;
  passwordHash: string;
  role: TenantRole;
}

export interface UpdateUserData {
  name?: string;
  role?: TenantRole;
}

export interface UserRepository {
  list(tenantId: string): Promise<TenantMemberData[]>;
  findById(tenantId: string, userId: string): Promise<TenantMemberData | null>;
  findByEmail(email: string): Promise<boolean>;
  create(tenantId: string, data: CreateUserData): Promise<TenantMemberData>;
  update(
    tenantId: string,
    userId: string,
    data: UpdateUserData,
  ): Promise<TenantMemberData>;
  delete(tenantId: string, userId: string): Promise<void>;
}
