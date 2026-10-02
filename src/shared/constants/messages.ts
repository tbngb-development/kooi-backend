export const AuthMessages = {
  // Success
  REGISTER_SUCCESS: "Registration successful",
  LOGIN_SUCCESS: "Login successful",
  TOKEN_REFRESHED: "Token refreshed successfully",
  TENANT_SELECTED: "Tenant selected successfully",
  INVITE_CREATED: "Invite created successfully",
  INVITE_ACCEPTED: "Invite accepted successfully",
  LOGOUT_SUCCESS: "Logged out successfully",

  // Password reset
  FORGOT_PASSWORD_SENT:
    "If an account with this email exists, an OTP has been sent.",
  OTP_INVALID: "Invalid or expired OTP.",
  OTP_MAX_ATTEMPTS:
    "Maximum OTP verification attempts exceeded. Please request a new OTP.",
  OTP_VERIFIED: "OTP verified successfully.",
  PASSWORD_RESET_SUCCESS:
    "Password has been reset successfully. Please login with your new password.",
  PASSWORD_CHANGED_SUCCESS: "Password changed successfully.",
  INVALID_OLD_PASSWORD: "Current password is incorrect.",
  SAME_PASSWORD_NOT_ALLOWED:
    "New password must be different from the current password.",
  RESET_TOKEN_INVALID:
    "Invalid or expired reset token. Please restart the process.",

  // Errors
  INVALID_CREDENTIALS: "Invalid email or password",
  EMAIL_ALREADY_EXISTS: "A user with this email already exists",
  INVALID_TOKEN: "Invalid or expired token",
  TOKEN_NOT_PROVIDED: "Authentication token not provided",
  TOKEN_EXPIRED: "Token has expired",
  REFRESH_TOKEN_INVALID: "Invalid or revoked refresh token",
  REFRESH_TOKEN_EXPIRED: "Refresh token has expired",
  FORBIDDEN: "You do not have permission to perform this action",
  USER_NOT_FOUND: "User not found",
  TENANT_NOT_FOUND: "Tenant not found",
  MEMBERSHIP_NOT_FOUND: "Membership not found for this tenant",
  TENANT_INACTIVE: "Tenant account is inactive",
  ALREADY_MEMBER: "User is already a member of this tenant",
  INVALID_INVITE: "Invalid or expired invite token",
  INVITE_EMAIL_MISMATCH: "Invite email does not match your account email",
  NOT_PLATFORM_ADMIN: "Platform admin access required",
  MULTIPLE_TENANTS: "Multiple memberships found. Please select a tenant.",

  // Validation
  PASSWORD_TOO_SHORT: "Password must be at least 8 characters",
  PASSWORD_TOO_LONG: "Password must not exceed 128 characters",
  PASSWORD_WEAK:
    "Password must contain at least one uppercase letter, one lowercase letter, and one number",
  NAME_REQUIRED: "Name is required",
  EMAIL_REQUIRED: "Email is required",
  TENANT_NAME_REQUIRED: "Tenant name is required",
} as const;

export const GeneralMessages = {
  INTERNAL_ERROR: "An unexpected error occurred",
  RESOURCE_CREATED: "Resource created successfully",
  RESOURCE_UPDATED: "Resource updated successfully",
  RESOURCE_DELETED: "Resource deleted successfully",
} as const;

export const AdminMessages = {
  TENANT_ID_REQUIRED: "tenantId is required for admin operations",
} as const;

export const WebhookMessages = {
  INVALID_SECRET: "Invalid or missing webhook secret",
} as const;

export const InviteMessages = {
  CREATED: "Invite created successfully",
  RESENT: "Invite resent successfully",
  REVOKED: "Invite revoked",
  INVALID: "Invalid or expired invite",
  ALREADY_ACCEPTED: "Invite already accepted",
  EMAIL_MISMATCH: "Email does not match invite",
} as const;

export const WalletMessages = {
  INSUFFICIENT_BALANCE: "Insufficient wallet balance. Please recharge.",
  LOW_BALANCE: "Wallet balance is below threshold",
  DEBIT_SUCCESS: "Amount debited",
  CREDIT_SUCCESS: "Amount credited",
} as const;

export const PaymentMessages = {
  ORDER_CREATED: "Payment order created",
  VERIFIED: "Payment verified successfully",
  FAILED: "Payment failed",
  INVALID_SIGNATURE: "Invalid payment signature",
  INVALID_SLAB: "Invalid recharge amount",
} as const;

export const RECHARGE_SLABS_PAISA = [
  100_000, // ₹1,000
  500_000, // ₹5,000
  1_000_000, // ₹10,000
  2_500_000, // ₹25,000
  10_000_000, // ₹1,00,000
] as const;
