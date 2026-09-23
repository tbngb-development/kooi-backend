import { z } from "zod";

const SUPPORTED_MODELS = [
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o-mini",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5.4-mini",
  "gpt-5.6-luna",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
] as const;

// ── Category Schemas ─────────────────────────────────────────────────────────

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  model: z.enum(SUPPORTED_MODELS).optional(),
  description: z.string().max(500).optional(),
  industryPackIds: z.array(z.string().uuid()).optional(),
  dispositionIds: z.array(z.string().uuid()).optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  model: z.enum(SUPPORTED_MODELS).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

export const listCategoriesQuerySchema = z.object({
  industryPackId: z.string().uuid().optional(),
  platformAgentId: z.string().uuid().optional(),
  isActive: z.preprocess(
    (val) => (val === "true" ? true : val === "false" ? false : undefined),
    z.boolean().optional(),
  ),
});

// ── Disposition Schemas ──────────────────────────────────────────────────────

export const createDispositionSchema = z.object({
  name: z.string().min(1).max(100),
  question: z.string().min(1).max(1000),
  systemPrompt: z.string().max(2000).optional(),
  model: z.enum(SUPPORTED_MODELS).optional(),
  isSubjective: z.boolean().optional(),
  isObjective: z.boolean().optional(),
  subjectiveType: z
    .enum(["text", "timestamp", "numeric", "boolean", "email", "regex"])
    .optional(),
  subjectiveTypeConfig: z
    .object({
      pattern: z.string(),
      description: z.string().optional(),
    })
    .nullable()
    .optional(),
  objectiveOptions: z
    .array(
      z.object({
        value: z.string(),
        condition: z.string(),
        sub_options: z.array(z.any()).optional(),
      }),
    )
    .nullable()
    .optional(),
  description: z.string().max(500).optional(),
  industryPackIds: z.array(z.string().uuid()).optional(),
  showInOverview: z.boolean().optional(),
  showInInsights: z.boolean().optional(),
});

export const updateDispositionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  question: z.string().min(1).max(1000).optional(),
  systemPrompt: z.string().max(2000).optional(),
  model: z.enum(SUPPORTED_MODELS).optional(),
  isSubjective: z.boolean().optional(),
  isObjective: z.boolean().optional(),
  subjectiveType: z
    .enum(["text", "timestamp", "numeric", "boolean", "email", "regex"])
    .optional(),
  subjectiveTypeConfig: z
    .object({
      pattern: z.string(),
      description: z.string().optional(),
    })
    .nullable()
    .optional(),
  objectiveOptions: z
    .array(
      z.object({
        value: z.string(),
        condition: z.string(),
        sub_options: z.array(z.any()).optional(),
      }),
    )
    .nullable()
    .optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  showInOverview: z.boolean().optional(),
  showInInsights: z.boolean().optional(),
});

export const listDispositionsQuerySchema = z.object({
  industryPackId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  platformAgentId: z.string().uuid().optional(),
  isActive: z.preprocess(
    (val) => (val === "true" ? true : val === "false" ? false : undefined),
    z.boolean().optional(),
  ),
});

// ── M2M Schemas ──────────────────────────────────────────────────────────────

export const attachIndustriesSchema = z.object({
  industryPackIds: z.array(z.string().uuid()).min(1),
});

export const attachDispositionsSchema = z.object({
  dispositionIds: z.array(z.string().uuid()).min(1),
});

// ── Discovery Schemas ────────────────────────────────────────────────────────

export const listBolnaCategoriesQuerySchema = z.object({
  agentBolnaId: z.string().uuid(),
});

export const listBolnaDispositionsQuerySchema = z.object({
  agentBolnaId: z.string().uuid().optional(),
});
