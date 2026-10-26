import { z } from "zod";

export const adjustWalletSchema = z.object({
  tenantId: z.string().uuid("Invalid tenant ID"),
  amount: z.number().int().min(1, "Amount must be a positive integer in paisa"),
  type: z.enum(["CREDIT", "DEBIT", "BONUS", "ADJUSTMENT", "REFUND"]),
  targetBalance: z.enum(["CASH", "BONUS"]).optional(),
  description: z.string().min(5, "Reason requires at least 5 characters"),
  bonusExpiresAt: z.string().datetime().nullable().optional(),
  idempotencyKey: z.string().min(8).optional(),
});

export const listTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z
    .enum(["CREDIT", "DEBIT", "BONUS", "BONUS_EXPIRY", "REFUND", "ADJUSTMENT"])
    .optional(),
  sourceType: z
    .enum([
      "RECHARGE",
      "CALL",
      "PLAN_BONUS",
      "BONUS_EXPIRY",
      "ADMIN_ADJUSTMENT",
      "REFUND",
    ])
    .optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});
