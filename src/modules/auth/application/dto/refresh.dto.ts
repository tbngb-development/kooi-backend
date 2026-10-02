export interface RefreshTokensInput {
  refreshToken: string;
}

export interface RefreshTokensOutput {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}