import { z } from "zod";

export const createOrderSchema = z.object({
  purpose: z.enum(["ONBOARDING", "WALLET_TOPUP", "PLAN_UPGRADE"]),
  amountPaisa: z
    .number()
    .int()
    .min(10000, "Minimum top-up is ₹100.00")
    .optional(),
  newPlanId: z
    .string()
    .uuid("Invalid plan ID")
    .optional(),
});

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const activateFreeOnboardingSchema = z.object({
  tenantId: z.string().uuid("Invalid tenant ID"),
});