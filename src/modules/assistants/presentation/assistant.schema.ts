import { z } from "zod";

export const welcomeMessageSchema = z.object({
  type: z.enum(["default", "custom"]),
  defaultValue: z.string().min(1, "Default welcome message is required").max(1000),
  customValue: z.string().max(2000).optional(),
});

export const assistantCallTypeConfigSchema = z.object({
  variables: z.record(z.string(), z.string()).optional(),
  welcomeMessage: welcomeMessageSchema.optional(),
});

export const assistantVariablesSchema = z.object({
  inbound: assistantCallTypeConfigSchema.optional(),
  outbound: assistantCallTypeConfigSchema.optional(),
});

export const registerAssistantSchema = z.object({
  name: z.string().min(1, "Friendly name is required").max(100),
  platformAgentId: z.string().uuid("Platform Agent ID must be a valid UUID"),
  variables: assistantVariablesSchema.optional(),
});

export const updateAssistantSchema = z
  .object({
    name: z.string().min(1, "Friendly name cannot be empty").max(100).optional(),
    variables: assistantVariablesSchema.optional(),
  })
  .refine(
    (data) => data.name !== undefined || data.variables !== undefined,
    {
      message: "At least one of 'name' or 'variables' must be provided",
    },
  );

export type RegisterAssistantBody = z.infer<typeof registerAssistantSchema>;
export type UpdateAssistantBody = z.infer<typeof updateAssistantSchema>;