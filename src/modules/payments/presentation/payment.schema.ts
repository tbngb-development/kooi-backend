import { z } from "zod";

export const createOrderSchema = z
  .object({
    purpose: z.enum(["ONBOARDING", "WALLET_TOPUP", "PLAN_UPGRADE"]),
    amountPaisa: z
      .number()
      .int()
      .min(100, "Minimum top-up is ₹1.00")
      .optional(),
    newPlanId: z.string().uuid("Invalid plan ID").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.purpose === "WALLET_TOPUP" && !data.amountPaisa) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amountPaisa"],
        message: "amountPaisa is required for WALLET_TOPUP",
      });
    }
    if (data.purpose === "PLAN_UPGRADE" && !data.newPlanId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPlanId"],
        message: "newPlanId is required for PLAN_UPGRADE",
      });
    }
  });

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const cancelPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1, "razorpayOrderId is required"),
  reason: z.string().trim().max(255).optional(),
});

export const activateFreeOnboardingSchema = z.object({
  tenantId: z.string().uuid("Invalid tenant ID"),
  waiverReason: z
    .string()
    .trim()
    .min(10, "Waiver reason must be at least 10 characters")
    .max(500)
    .optional(),
});

export const listAdminPaymentsQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  status: z
    .enum([
      "INITIATED",
      "SUCCESS",
      "FAILED",
      "REFUNDED",
      "CANCELLED",
      "EXPIRED",
    ])
    .optional(),
  purpose: z.enum(["ONBOARDING", "WALLET_TOPUP", "PLAN_UPGRADE"]).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});
