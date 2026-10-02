export interface PasswordResetTokenPayload {
  userId: string;
  email: string;
  type: "password-reset";
}

export interface PasswordResetTokenService {
  generate(userId: string, email: string): Promise<string>;
  verify(token: string): Promise<PasswordResetTokenPayload>;
  invalidate(token: string): Promise<void>;
}
