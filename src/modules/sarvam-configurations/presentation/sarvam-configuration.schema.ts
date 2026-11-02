import { z } from "zod";

export const createSarvamConfigurationSchema = z.object({
  tenantId: z.string().uuid("Invalid tenant ID format"),
  apiKey: z.string().min(1, "API Key is required"),
  workspaceId: z.string().min(1, "Workspace ID is required"),
  organizationId: z.string().min(1, "Organization ID is required"),
  isActive: z.boolean().optional().default(true),
});

export const updateSarvamConfigurationSchema = z.object({
  apiKey: z.string().min(1, "API Key cannot be blank").optional(),
  workspaceId: z.string().min(1, "Workspace ID cannot be blank").optional(),
  organizationId: z.string().min(1, "Organization ID cannot be blank").optional(),
  isActive: z.boolean().optional(),
});

export const listSarvamConfigurationsQuerySchema = z.object({
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

export type CreateSarvamConfigurationInput = z.infer<
  typeof createSarvamConfigurationSchema
>;
export type UpdateSarvamConfigurationInput = z.infer<
  typeof updateSarvamConfigurationSchema
>;
export type ListSarvamConfigurationsQuery = z.infer<
  typeof listSarvamConfigurationsQuerySchema
>;

