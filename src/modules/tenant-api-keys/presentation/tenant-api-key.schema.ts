import { z } from "zod";

export const listTenantApiKeysQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const apiKeyParamSchema = z.object({
  id: z.string().uuid("Invalid API key ID format"),
});

export type ListTenantApiKeysQueryInputSchema = z.infer<
  typeof listTenantApiKeysQuerySchema
>;
export type ApiKeyParamInputSchema = z.infer<typeof apiKeyParamSchema>;
