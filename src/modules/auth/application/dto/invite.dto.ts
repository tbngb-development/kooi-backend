import type { TenantRole } from "@prisma/client";

export interface CreateInviteInput {
  tenantId: string;
  email: string;
  role: TenantRole;
  inviterId: string;
}

export interface CreateInviteOutput {
  inviteToken: string;
  inviteUrl: string;
  expiresAt: string;
}

export interface AcceptInviteInput {
  inviteToken: string;
  email: string;
  password: string;
  name: string;
}

export interface AcceptInviteOutput {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  user: {
    id: string;
    email: string;
    name: string;
  };
  membership: {
    id: string;
    tenantId: string;
    tenantName: string;
    role: string;
  };
}