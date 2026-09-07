import type { TenantRole } from "@prisma/client";

export interface AuthUserEntity {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  passwordHash: string;
  isPlatformAdmin: boolean;
  memberships: AuthMembershipEntity[];
}

export interface AuthMembershipEntity {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantActive: boolean;
  role: TenantRole;
}