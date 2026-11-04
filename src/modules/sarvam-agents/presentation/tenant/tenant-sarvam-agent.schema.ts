import { z } from "zod";

export const updateTenantVariablesSchema = z.object({
  variables: z.record(
    z.string().min(1, "Variable key cannot be empty"),
    z.string().nullable(),
  ),
});

export const updateTenantWelcomeMessageSchema = z.object({
  customMessage: z.string().trim().nullable(),
});

