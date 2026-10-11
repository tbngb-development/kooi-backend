import { z } from "zod";

/**
 * POST /import – body schema
 * bolnaApiKeyId is optional; if omitted the use-case picks the platform default.
 */
export const importInboundNumbersSchema = z.object({
  bolnaApiKeyId: z.string().uuid().optional(),
});

/**
 * POST /custom – body schema for manual/third-party telephony providers (e.g. Vobiz)
 */
export const createCustomInboundNumberSchema = z.object({
  phoneNumber: z
    .string()
    .min(5, "Phone number is too short")
    .max(20, "Phone number is too long"),
  provider: z.string().min(1, "Provider name is required").default("custom"),
  providerNumberId: z.string().max(100).optional(),
  monthlyRentalPaisa: z.number().int().nonnegative().optional().default(0),
});

/**
 * POST /:id/assign – body schema
 */
export const assignInboundNumberSchema = z.object({
  tenantId: z.string().uuid("Invalid tenant ID format"),
  assistantId: z.string().uuid("Invalid assistant ID format"),
  monthlyRentalPaisa: z.number().int().nonnegative().optional(),
});

/**
 * POST /:id/suspend – body schema (body may be absent entirely)
 */
export const suspendInboundNumberSchema = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .optional()
  .default({});

/**
 * GET / – query-string schema (used with validateQuery)
 */
export const listInboundNumbersQuerySchema = z.object({
  status: z.enum(["AVAILABLE", "ACTIVE", "SUSPENDED", "RELEASED"]).optional(),
  providerSyncStatus: z.enum(["SYNCED", "PENDING_SYNC", "FAILED"]).optional(),
  tenantId: z.string().uuid().optional(),
  assistantId: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
