export interface RegisterTenantOwnerInput {
  verificationToken: string;
  name: string;
  tenantName: string;
  password: string;
  termsAccepted: boolean;
  termsVersion: string;
}

export interface RegisterTenantOwnerOutput {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  user: {
    id: string;
    email: string;
    name: string;
  };
  tenant: {
    id: string;
    name: string;
  };
  membership: {
    id: string;
    role: string;
  };
}
