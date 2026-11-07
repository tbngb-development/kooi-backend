import { z } from "zod";

export const sarvamVariableDataTypeSchema = z.literal("string").default("string");
export const sarvamVariableInputTypeSchema = z.enum(["text", "textarea"]).default("text");

export const sarvamAgentVariableSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, "Variable key is required")
      .max(60, "Variable key must be at most 60 characters")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Variable key can only contain alphanumeric characters, underscores, and hyphens",
      ),
    dataType: sarvamVariableDataTypeSchema,
    inputType: sarvamVariableInputTypeSchema,
    required: z.boolean().default(false),
    defaultValue: z.string().default(""),
    description: z.string().trim().max(500).nullable().optional(),
    isTenantVisible: z.boolean().default(true),
    isTenantEditable: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.inputType !== "text" && data.inputType !== "textarea") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inputType"],
        message: "String variables only support 'text' or 'textarea' input types.",
      });
    }
  });

export const welcomeMessageConfigSchema = z.object({
  defaultMessage: z.string().default(""),
  customTemplate: z.string().trim().nullable().optional(),
  interpolationVariables: z.array(z.string().trim().min(1)).optional().default([]),
});

export const sarvamOutputVariableSchema = z
  .object({
    name: z.string().trim().min(1, "Output variable name is required"),
    description: z.string().trim().min(1, "Output variable description is required"),
    type: z.enum(["string", "enum"]).default("string"),
    options: z.array(z.string().trim().min(1, "Option cannot be empty")).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (data.type === "enum") {
      const cleanOptions = (data.options || []).map((o) => o.trim()).filter(Boolean);
      if (cleanOptions.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: "At least one option is required for enum output variables.",
        });
      }
      const unique = new Set(cleanOptions.map((o) => o.toLowerCase()));
      if (unique.size !== cleanOptions.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: "Enum options must be unique.",
        });
      }
    }
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

export const sarvamAgentGoalSchema = z.object({
  id: z.string().uuid().optional(),
  outputVariableName: z.string().trim().min(1, "Variable name is required"),
  expectedValue: z.string().min(1, "Expected value is required"),
  displayName: z.string().trim().min(1, "Display name is required"),
});

export const createSarvamAgentSchema = z
  .object({
    name: z.string().trim().min(1, "Agent name is required").max(255),
    apiKeyId: z.string().uuid("A valid Sarvam API Key ID is required"),
    appId: z.string().trim().min(1, "App ID is required").max(255),
    appVersion: z.number().int().min(1, "App Version must be at least 1").default(1),
    attemptsPerSecond: z.number().int().positive().nullable().optional(),
    agentVariables: z.array(sarvamAgentVariableSchema).optional().default([]),
    welcomeMessage: welcomeMessageConfigSchema.optional().default({ defaultMessage: "", interpolationVariables: [] }),
    outputVariables: z.array(sarvamOutputVariableSchema).optional().default([]),
    connectionConfigs: z
      .array(sarvamConnectionConfigSchema)
      .min(1, "At least one telephony connection configuration is required"),
    retryConfig: sarvamRetryConfigSchema.optional().default({ max_retries: 0 }),
    allowTenantVisible: z.boolean().optional().default(false),
    goals: z.array(sarvamAgentGoalSchema).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (data.goals && data.goals.length > 0) {
      const seen = new Set<string>();
      for (let i = 0; i < data.goals.length; i++) {
        const goal = data.goals[i];
        const key = `${goal.outputVariableName.trim()}:${goal.expectedValue.trim()}`;
        if (seen.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["goals", i],
            message: `Duplicate goal for variable "${goal.outputVariableName}" and value "${goal.expectedValue}".`,
          });
        }
        seen.add(key);

        const variable = (data.outputVariables || []).find(
          (v) => v.name.trim() === goal.outputVariableName.trim(),
        );
        if (!variable) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["goals", i, "outputVariableName"],
            message: `Referenced output variable "${goal.outputVariableName}" does not exist.`,
          });
        } else if (variable.type !== "enum") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["goals", i, "outputVariableName"],
            message: `Only enum output variables can be used for goals. "${goal.outputVariableName}" is ${variable.type}.`,
          });
        } else if (!variable.options?.map((o) => o.trim()).includes(goal.expectedValue.trim())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["goals", i, "expectedValue"],
            message: `Expected value "${goal.expectedValue}" is not among configured options for "${goal.outputVariableName}".`,
          });
        }
      }
    }
  });

export const updateSarvamAgentSchema = z
  .object({
    name: z.string().trim().min(1, "Agent name cannot be empty").max(255).optional(),
    appId: z.string().trim().min(1, "App ID cannot be empty").max(255).optional(),
    appVersion: z.number().int().min(1, "App Version must be at least 1").optional(),
    attemptsPerSecond: z.number().int().positive().nullable().optional(),
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
    goals: z.array(sarvamAgentGoalSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.goals && data.goals.length > 0) {
      const seen = new Set<string>();
      for (let i = 0; i < data.goals.length; i++) {
        const goal = data.goals[i];
        const key = `${goal.outputVariableName.trim()}:${goal.expectedValue.trim()}`;
        if (seen.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["goals", i],
            message: `Duplicate goal for variable "${goal.outputVariableName}" and value "${goal.expectedValue}".`,
          });
        }
        seen.add(key);

        if (data.outputVariables !== undefined) {
          const variable = data.outputVariables.find(
            (v) => v.name.trim() === goal.outputVariableName.trim(),
          );
          if (!variable) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["goals", i, "outputVariableName"],
              message: `Referenced output variable "${goal.outputVariableName}" does not exist.`,
            });
          } else if (variable.type !== "enum") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["goals", i, "outputVariableName"],
              message: `Only enum output variables can be used for goals. "${goal.outputVariableName}" is ${variable.type}.`,
            });
          } else if (!variable.options?.map((o) => o.trim()).includes(goal.expectedValue.trim())) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["goals", i, "expectedValue"],
              message: `Expected value "${goal.expectedValue}" is not among configured options for "${goal.outputVariableName}".`,
            });
          }
        }
      }
    }
  });

export const listSarvamAgentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().optional(),
  apiKeyId: z.string().trim().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  tenantId: z.string().trim().optional(),
});
