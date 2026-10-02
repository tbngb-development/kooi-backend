import { z } from "zod";


const requiredVariableSchema = z.object({
  name: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  required: z.boolean().default(true),
  isEditable: z.boolean().default(true),
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
