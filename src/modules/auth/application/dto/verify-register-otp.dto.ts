export interface VerifyRegisterOtpInput {
  email: string;
  otp: string;
}

export interface VerifyRegisterOtpOutput {
  verificationToken: string;
  email: string;
  expiresIn: number;
}
