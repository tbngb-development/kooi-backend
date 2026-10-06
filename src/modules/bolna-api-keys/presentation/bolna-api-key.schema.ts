import { z } from "zod";

export const createBolnaApiKeySchema = z.object({
  keyIdentifier: z.string().min(1).max(100),
  plainTextKey: z.string().min(10, "Bolna API key looks too short"),
  type: z.enum(["GENERAL", "CUSTOM"]),
  isPlatformDefault: z.boolean().optional(),
});

export const assignKeySchema = z.object({
  tenantId: z.string().uuid("Invalid tenant ID format"),
});

export const updateBolnaApiKeySchema = z.object({
  keyIdentifier: z.string().min(1).max(100).optional(),
  plainTextKey: z
    .string()
    .min(10, "Rotated Bolna API key looks too short")
    .optional(),
  type: z.enum(["GENERAL", "CUSTOM"]).optional(),
});

export const listKeyTenantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export const switchReadinessQuerySchema = z.object({
  tenantId: z.string().uuid("Invalid tenant ID format"),
  targetKeyId: z.string().uuid("Invalid target Bolna API key ID format"),
});

export type CreateBolnaApiKeyInput = z.infer<typeof createBolnaApiKeySchema>;
export type AssignKeyInput = z.infer<typeof assignKeySchema>;
export type UpdateBolnaApiKeyInput = z.infer<typeof updateBolnaApiKeySchema>;
export type ListKeyTenantsQuery = z.infer<typeof listKeyTenantsQuerySchema>;
export type SwitchReadinessQuery = z.infer<typeof switchReadinessQuerySchema>;
