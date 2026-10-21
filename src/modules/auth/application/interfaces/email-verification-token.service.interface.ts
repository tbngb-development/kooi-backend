export interface EmailVerificationTokenPayload {
  email: string;
  type: "email-verification";
}

export interface EmailVerificationTokenService {
  generate(email: string): Promise<string>;
  verify(token: string): Promise<EmailVerificationTokenPayload>;
  invalidate(token: string): Promise<void>;
}
