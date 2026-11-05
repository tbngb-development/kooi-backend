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

export const sarvamConnectionConfigSchema = z
  .object({
    connection_id: z.string().trim().min(1, "Connection ID is required"),
    agent_phone_number: z.string().trim().min(1, "Agent phone number is required"),
    phone_numbers: z.array(z.string().trim()).optional(),
  })
  .strict();

export const sarvamRetryConditionSchema = z
  .object({
    enabled: z.boolean(),
    threshold_seconds: z
      .number()
      .int("threshold_seconds must be an integer")
      .min(0, "threshold_seconds must be non-negative")
      .nullable()
      .optional(),
  })
  .strict();

export const sarvamRetryConfigSchema = z
  .object({
    max_retries: z
      .number()
      .int("max_retries must be an integer")
      .min(0, "max_retries must be at least 0")
      .max(20, "max_retries cannot exceed 20")
      .default(0),
    retry_on: z
      .record(
        z.string().min(1, "Condition key cannot be empty"),
        sarvamRetryConditionSchema,
      )
      .nullable()
      .optional(),
    retry_interval_minutes: z
      .union([
        z
          .number()
          .int("retry_interval_minutes must be an integer")
          .min(0, "retry_interval_minutes must be non-negative"),
        z.array(
          z
            .number()
            .int("retry_interval_minutes array items must be integers")
            .min(0, "retry_interval_minutes items must be non-negative"),
        ),
      ])
      .nullable()
      .optional(),
  })
  .strict();

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
  connectionConfigs: z
    .array(sarvamConnectionConfigSchema)
    .min(1, "At least one telephony connection configuration is required"),
  retryConfig: sarvamRetryConfigSchema.optional().default({ max_retries: 0 }),
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
  connectionConfigs: z
    .array(sarvamConnectionConfigSchema)
    .min(1, "At least one telephony connection configuration is required")
    .optional(),
  retryConfig: sarvamRetryConfigSchema.optional(),
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

