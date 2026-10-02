import { z } from "zod";

export const adjustWalletSchema = z.object({
  tenantId: z.string().uuid("Invalid tenant ID"),
  amount: z.number().int().min(1, "Amount must be a positive integer in paisa"),
  type: z.enum(["CREDIT", "DEBIT", "BONUS", "ADJUSTMENT", "REFUND"]),
  targetBalance: z.enum(["CASH", "BONUS"]).optional(),
  description: z.string().min(1, "Description is required"),
  bonusExpiresAt: z.string().datetime().nullable().optional(),
});

export const listTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z
    .enum(["CREDIT", "DEBIT", "BONUS", "BONUS_EXPIRY", "REFUND", "ADJUSTMENT"])
    .optional(),
});
