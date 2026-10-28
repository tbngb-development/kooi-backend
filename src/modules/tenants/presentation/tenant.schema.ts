import { z } from "zod";

// Tenant managers can only update workspace name
export const updateWorkspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required").max(100),
});

export const adminUpdateTenantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  suspensionReason: z.string().trim().min(5, "Suspension reason must be at least 5 characters").max(500).optional(),
});

export type UpdateWorkspaceBody = z.infer<typeof updateWorkspaceSchema>;
export type AdminUpdateTenantBody = z.infer<typeof adminUpdateTenantSchema>;
