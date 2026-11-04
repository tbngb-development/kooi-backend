import { z } from "zod";

export const sarvamAgentVariableSchema = z.object({
  key: z.string().trim().min(1, "Variable key is required"),
  defaultValue: z.string().default(""),
  isTenantVisible: z.boolean().default(true),
  isTenantEditable: z.boolean().default(true),
});

export const welcomeMessageConfigSchema = z.object({
  defaultMessage: z.string().default(""),
});

export const sarvamOutputVariableSchema = z.object({
  name: z.string().trim().min(1, "Output variable name is required"),
  description: z.string().trim().min(1, "Output variable description is required"),
});

export const createSarvamAgentSchema = z.object({
  name: z.string().trim().min(1, "Agent name is required").max(255),
  apiKeyId: z.string().uuid("A valid Sarvam API Key ID is required"),
  appId: z.string().trim().min(1, "App ID is required").max(255),
  appVersion: z.number().int().min(1, "App Version must be at least 1").default(1),
  attemptsPerSecond: z.number().int().positive().nullable().optional(),
  webhookUrl: z
    .string()
    .trim()
    .url("Webhook URL must be a valid URL")
    .nullable()
    .optional()
    .or(z.literal("")),
  agentVariables: z.array(sarvamAgentVariableSchema).optional().default([]),
  welcomeMessage: welcomeMessageConfigSchema.optional().default({ defaultMessage: "" }),
  outputVariables: z.array(sarvamOutputVariableSchema).optional().default([]),
  allowTenantVisible: z.boolean().optional().default(false),
});

export const updateSarvamAgentSchema = z.object({
  name: z.string().trim().min(1, "Agent name cannot be empty").max(255).optional(),
  appId: z.string().trim().min(1, "App ID cannot be empty").max(255).optional(),
  appVersion: z.number().int().min(1, "App Version must be at least 1").optional(),
  attemptsPerSecond: z.number().int().positive().nullable().optional(),
  webhookUrl: z
    .string()
    .trim()
    .url("Webhook URL must be a valid URL")
    .nullable()
    .optional()
    .or(z.literal("")),
  agentVariables: z.array(sarvamAgentVariableSchema).optional(),
  welcomeMessage: welcomeMessageConfigSchema.optional(),
  outputVariables: z.array(sarvamOutputVariableSchema).optional(),
  allowTenantVisible: z.boolean().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export const listSarvamAgentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().optional(),
  apiKeyId: z.string().trim().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  tenantId: z.string().trim().optional(),
});

