export interface OtpVerificationResult {
  valid: boolean;
  attemptsRemaining: number;
  maxAttemptsExceeded: boolean;
}

export interface OtpService {
  generateAndStore(purpose: string, identifier: string): Promise<string>;
  verify(
    purpose: string,
    identifier: string,
    otp: string,
  ): Promise<OtpVerificationResult>;
  invalidate(purpose: string, identifier: string): Promise<void>;
}
