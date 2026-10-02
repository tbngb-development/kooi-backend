export interface ResetPasswordInput {
  resetToken: string;
  newPassword: string;
}

export interface ResetPasswordOutput {
  message: string;
}
