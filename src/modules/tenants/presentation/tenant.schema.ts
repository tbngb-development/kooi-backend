import { z } from "zod";

// Tenant managers can only update workspace name
export const updateWorkspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required").max(100),
});

// Platform admins can update name and toggle active status
export const adminUpdateTenantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateWorkspaceBody = z.infer<typeof updateWorkspaceSchema>;
export type AdminUpdateTenantBody = z.infer<typeof adminUpdateTenantSchema>;
