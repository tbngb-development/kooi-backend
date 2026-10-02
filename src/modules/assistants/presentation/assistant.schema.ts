import { z } from "zod";

export const registerAssistantSchema = z.object({
  name: z.string().min(1, "Friendly name is required").max(100),
  platformAgentId: z.string().uuid("Platform Agent ID must be a valid UUID"),
});

export const updateAssistantSchema = z.object({
  name: z.string().min(1, "Friendly name is required").max(100),
});

export type RegisterAssistantBody = z.infer<typeof registerAssistantSchema>;
export type UpdateAssistantBody = z.infer<typeof updateAssistantSchema>;