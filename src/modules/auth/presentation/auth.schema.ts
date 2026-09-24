import { z } from "zod";

const emailSchema = z.email("Invalid email format").toLowerCase().trim();

const passwordSchema = z
  .string()
  .min(1, "Password is required")
  .max(128, "Password too long");

const nameSchema = z
  .string()
  .min(1, "Name is required")
  .max(100, "Name too long")
  .trim();

export const sendRegisterOtpSchema = z.object({
  email: emailSchema,
});

export const registerTenantOwnerSchema = z.object({
  tenantName: z
    .string()
    .min(1, "Tenant name is required")
    .max(100, "Tenant name too long")
    .trim(),
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  termsAccepted: z.literal(true, {
    message: "You must accept the Terms & Conditions to continue.",
  }),
  termsVersion: z.string().min(1, "Terms version is required").max(20),
  otp: z
    .string()
    .length(6, "Verification code must be 6 digits")
    .regex(/^\d{6}$/, "Verification code must be numeric"),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  tenantId: z.string().uuid("Invalid tenant ID").optional(),
});

export const selectTenantSchema = z.object({
  tenantId: z.string().uuid("Invalid tenant ID"),
});

export const refreshTokensSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required").optional(),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required").optional(),
});

export const createInviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["ADMIN", "USER"], {
    message: "Role must be ADMIN or USER",
  }),
});

export const acceptInviteSchema = z.object({
  inviteToken: z.string().min(1, "Invite token is required"),
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
});

export const adminLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

// Password reset schemas
const strongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password too long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const verifyForgotPasswordOtpSchema = z.object({
  email: emailSchema,
  otp: z
    .string()
    .length(6, "OTP must be 6 digits")
    .regex(/^\d{6}$/, "OTP must be numeric"),
});

export const resetPasswordSchema = z.object({
  resetToken: z.string().min(1, "Reset token is required"),
  newPassword: strongPasswordSchema,
});

export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, "Current password is required"),
    newPassword: strongPasswordSchema,
  })
  .refine((data) => data.oldPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

export type SendRegisterOtpBody = z.infer<typeof sendRegisterOtpSchema>;
export type RegisterTenantOwnerBody = z.infer<typeof registerTenantOwnerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type SelectTenantBody = z.infer<typeof selectTenantSchema>;
export type RefreshTokensBody = z.infer<typeof refreshTokensSchema>;
export type LogoutBody = z.infer<typeof logoutSchema>;
export type CreateInviteBody = z.infer<typeof createInviteSchema>;
export type AcceptInviteBody = z.infer<typeof acceptInviteSchema>;
export type AdminLoginBody = z.infer<typeof adminLoginSchema>;

export type ForgotPasswordBody = z.infer<typeof forgotPasswordSchema>;
export type VerifyForgotPasswordOtpBody = z.infer<
  typeof verifyForgotPasswordOtpSchema
>;
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;
