import { z } from "zod";

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

export const sendMobileOtpSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(
      E164_REGEX,
      "Mobile number must be in valid E.164 format (e.g. +919876543210)",
    ),
});

export type SendMobileOtpBody = z.infer<typeof sendMobileOtpSchema>;

export const verifyMobileOtpSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(
      E164_REGEX,
      "Mobile number must be in valid E.164 format (e.g. +919876543210)",
    ),
  otp: z
    .string()
    .trim()
    .length(6, "Verification code must be exactly 6 digits")
    .regex(/^\d{6}$/, "Verification code must contain only numbers"),
});

export type VerifyMobileOtpBody = z.infer<typeof verifyMobileOtpSchema>;
