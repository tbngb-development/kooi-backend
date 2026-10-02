import { z } from "zod";

export const createBolnaApiKeySchema = z.object({
  keyIdentifier: z.string().min(1).max(100),
  plainTextKey: z.string().min(10, "Bolna API key looks too short"),
  type: z.enum(["GENERAL", "CUSTOM"]),
  isPlatformDefault: z.boolean().optional(),
});

export const assignKeySchema = z.object({
  tenantId: z.string().uuid(),
});
