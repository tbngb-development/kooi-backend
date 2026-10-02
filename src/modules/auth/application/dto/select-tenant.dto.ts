export interface SelectTenantInput {
  userId: string;
  tenantId: string;
}

export interface SelectTenantOutput {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  membership: {
    id: string;
    tenantId: string;
    tenantName: string;
    role: string;
  };
}