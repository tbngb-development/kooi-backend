import { z } from "zod";

const requiredVariableSchema = z.object({
  name: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  required: z.boolean().default(true),
  isEditable: z.boolean().default(true),
  inputType: z.enum(["text", "textarea"]).default("text"),
  defaultValue: z.string().max(2000).nullable().default(null),
});

const genderSchema = z.enum(["MALE", "FEMALE"]);

// ── Platform Agent CRUD ─────────────────────────────────────────────────────

export const registerPlatformAgentSchema = z.object({
  bolnaId: z.string().uuid(),
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  bolnaApiKeyId: z.string().uuid("Bolna API Key ID must be a valid UUID"),
  industryPackId: z.string().uuid().optional(),
  category: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  welcomeMessage: z.string().max(1000).nullable().optional(),
  requiredVariables: z.array(requiredVariableSchema).nullable().optional(),
  gender: genderSchema.nullable().optional(),
});

export const updatePlatformAgentSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  name: z.string().min(1).max(100).optional(),
  bolnaApiKeyId: z.string().uuid().optional(),
  industryPackId: z.string().uuid().nullable().optional(),
  category: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  welcomeMessage: z.string().max(1000).nullable().optional(),
  requiredVariables: z.array(requiredVariableSchema).nullable().optional(),
  gender: genderSchema.nullable().optional(),
});

export const updateExtractionConfigSchema = z.object({
  welcomeMessage: z.string().max(1000).nullable().optional(),
  requiredVariables: z.array(requiredVariableSchema).nullable().optional(),
  gender: genderSchema.nullable().optional(),
});

export const listPlatformAgentsQuerySchema = z.object({
  industryPackId: z.string().uuid().optional(),
  isActive: z.preprocess(
    (val) => (val === "true" ? true : val === "false" ? false : undefined),
    z.boolean().optional(),
  ),
});

export const importFromBolnaSchema = z.object({
  bolnaId: z.string().uuid(),
  bolnaApiKeyId: z.string().uuid().optional(),
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  name: z.string().min(1).max(100).optional(),
  industryPackId: z.string().uuid().optional(),
  category: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  includeExtractions: z.boolean().optional(),
});

export const assignCategoriesSchema = z.object({
  categoryIds: z.array(z.string().uuid()).min(1),
});

export const assignDispositionsSchema = z.object({
  dispositionIds: z.array(z.string().uuid()).min(1),
});

// ── NEW: Create Agent from Scratch Schema ───────────────────────────
export const createAgentFromScratchSchema = z.object({
  bolnaApiKeyId: z.string().uuid("Invalid Bolna API key ID format"),
  agentName: z.string().min(1, "Agent name is required").max(200),
  systemPrompt: z
    .string()
    .min(10, "System prompt must be at least 10 characters"),
  welcomeMessage: z.string().optional(),
  industryPackId: z.string().uuid("Invalid industry pack ID format").optional(),
  category: z.string().optional(),
  description: z.string().optional(),
});

// ── NEW: Clone Platform Agent Schema ────────────────────────────────
export const clonePlatformAgentSchema = z.object({
  sourcePlatformAgentId: z
    .string()
    .uuid("Invalid source platform agent ID format"),
  targetApiKeyId: z.string().uuid("Invalid target Bolna API key ID format"),
  newName: z.string().min(1).max(200).optional(),
});

export type CreateAgentFromScratchInput = z.infer<
  typeof createAgentFromScratchSchema
>;
export type ClonePlatformAgentInput = z.infer<typeof clonePlatformAgentSchema>;

// ── Test Extraction Schemas ──────────────────────────────────────────
export const testAgentExtractionSchema = z.object({
  callId: z.string().uuid("Invalid call ID format").optional(),
  customTranscript: z.string().min(1).max(30000).optional(),
  dispositionIds: z.array(z.string().uuid("Invalid disposition ID")).optional(),
  provider: z.enum(["gemini", "openai"]).optional().default("gemini"),
  model: z.string().max(100).optional(),
  apiKey: z.string().max(250).optional(),
});

export const listTestCallsQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.preprocess(
    (val) => (val ? Number(val) : 20),
    z.number().int().min(1).max(50).default(20),
  ),
});

export type TestAgentExtractionBody = z.infer<typeof testAgentExtractionSchema>;
export type ListTestCallsQuery = z.infer<typeof listTestCallsQuerySchema>;
