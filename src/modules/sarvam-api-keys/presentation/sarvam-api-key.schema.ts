import { z } from "zod";

export const createSarvamApiKeySchema = z.object({
  tenantId: z.string().uuid("Invalid tenant ID format"),
  apiKey: z.string().min(1, "API Key is required"),
  workspaceId: z.string().min(1, "Workspace ID is required"),
  organizationId: z.string().min(1, "Organization ID is required"),
  isActive: z.boolean().optional().default(true),
});

export const updateSarvamApiKeySchema = z.object({
  apiKey: z.string().min(1, "API Key cannot be blank").optional(),
  workspaceId: z.string().min(1, "Workspace ID cannot be blank").optional(),
  organizationId: z
    .string()
    .min(1, "Organization ID cannot be blank")
    .optional(),
  isActive: z.boolean().optional(),
});

export const listSarvamApiKeysQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  tenantId: z.string().uuid("Invalid tenant ID format").optional(),
  isActive: z
    .preprocess((val) => {
      if (val === "true" || val === true) return true;
      if (val === "false" || val === false) return false;
      return undefined;
    }, z.boolean().optional())
    .optional(),
});

export type CreateSarvamApiKeyInput = z.infer<
  typeof createSarvamApiKeySchema
>;
export type UpdateSarvamApiKeyInput = z.infer<
  typeof updateSarvamApiKeySchema
>;
export type ListSarvamApiKeysQuery = z.infer<
  typeof listSarvamApiKeysQuerySchema
>;

