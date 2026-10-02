import type { MembershipInfo } from "../../../../shared/types";

export interface LoginInput {
  email: string;
  password: string;
  tenantId?: string;
}

export interface LoginOutput {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresIn: number | null;
  refreshTokenExpiresIn: number | null;
  requiresTenantSelection: boolean;
  user: {
    id: string;
    email: string;
    name: string;
    isPlatformAdmin: boolean;
  };
  memberships: MembershipInfo[];
}