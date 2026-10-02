export interface VerifyOtpInput {
  email: string;
  otp: string;
}

export interface VerifyOtpOutput {
  resetToken: string;
  expiresIn: number;
}
