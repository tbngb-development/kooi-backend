import { type TenantRole } from "@prisma/client";
import { type TenantMemberData } from "../../domain/entities/tenant-member.entity";

export interface UpdateUserData {
  name?: string;
  role?: TenantRole;
}

/**
 * Tenant membership administration. User creation is intentionally absent:
 * people are created only through self-service auth/owner-invite acceptance,
 * never by another member choosing their password.
 */
export interface UserRepository {
  list(tenantId: string): Promise<TenantMemberData[]>;
  findById(tenantId: string, userId: string): Promise<TenantMemberData | null>;
  update(
    tenantId: string,
    userId: string,
    data: UpdateUserData,
  ): Promise<TenantMemberData>;
  delete(tenantId: string, userId: string): Promise<void>;
  countOwners(tenantId: string): Promise<number>;
}
