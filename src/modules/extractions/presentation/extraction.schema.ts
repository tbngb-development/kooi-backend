import { z } from "zod";
import { Industry } from "@prisma/client";

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

// ── Category Schemas ─────────────────────────────────────────────────

export const createCategorySchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  model: z.enum(SUPPORTED_MODELS).optional(),
  industry: z.nativeEnum(Industry),
  description: z.string().max(500).optional(),
  platformAgentId: z.string().uuid().optional(),
});

export const updateCategorySchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  name: z.string().min(1).max(100).optional(),
  model: z.enum(SUPPORTED_MODELS).optional(),
  industry: z.nativeEnum(Industry).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  platformAgentId: z.string().uuid().optional(),
});

export const listCategoriesQuerySchema = z.object({
  industry: z.nativeEnum(Industry).optional(),
  isActive: z.preprocess(
    (val) => (val === "true" ? true : val === "false" ? false : undefined),
    z.boolean().optional(),
  ),
  platformAgentId: z.string().uuid().optional(),
});

// ── Disposition Schemas ──────────────────────────────────────────────

export const createDispositionSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
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
  industry: z.nativeEnum(Industry),
  description: z.string().max(500).optional(),
  categoryId: z.string().uuid(),
});

export const updateDispositionSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
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
  industry: z.nativeEnum(Industry).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  categoryId: z.string().uuid().optional(),
});

export const listDispositionsQuerySchema = z.object({
  industry: z.nativeEnum(Industry).optional(),
  isActive: z.preprocess(
    (val) => (val === "true" ? true : val === "false" ? false : undefined),
    z.boolean().optional(),
  ),
  categoryId: z.string().uuid().optional(),
});

export const importExtractionsFromBolnaSchema = z.object({
  platformAgentId: z.string().uuid(),
  categoryBolnaIds: z.array(z.string().uuid()).optional(),
  dispositionBolnaIds: z.array(z.string().uuid()).optional(),
});

export const listBolnaDispositionsQuerySchema = z.object({
  platformAgentId: z.string().uuid().optional(),
});
