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

export const switchReadinessQuerySchema = z.object({
  tenantId: z.string().uuid("Invalid tenant ID format"),
  targetKeyId: z.string().uuid("Invalid target Bolna API key ID format"),
});

export type CreateBolnaApiKeyInput = z.infer<typeof createBolnaApiKeySchema>;
export type AssignKeyInput = z.infer<typeof assignKeySchema>;
export type SwitchReadinessQuery = z.infer<typeof switchReadinessQuerySchema>;
