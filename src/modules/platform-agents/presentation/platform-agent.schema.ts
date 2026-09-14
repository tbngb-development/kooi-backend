import { z } from "zod";
import { Industry } from "@prisma/client";

export const registerPlatformAgentSchema = z.object({
  bolnaId: z.string().uuid(),
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  industry: z.nativeEnum(Industry).optional(),
  industryPackId: z.string().uuid().optional(),
  category: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const updatePlatformAgentSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  name: z.string().min(1).max(100).optional(),
  industry: z.nativeEnum(Industry).optional(),
  industryPackId: z.string().uuid().nullable().optional(),
  category: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const listPlatformAgentsQuerySchema = z.object({
  industry: z.nativeEnum(Industry).optional(),
  industryPackId: z.string().uuid().optional(),
  isActive: z.preprocess(
    (val) => (val === "true" ? true : val === "false" ? false : undefined),
    z.boolean().optional(),
  ),
});

export const importFromBolnaSchema = z.object({
  bolnaId: z.string().uuid(),
  slug: z.string().min(3).max(60).regex(/^[a-z0-9-]+$/).optional(),
  name: z.string().min(1).max(100).optional(),
  industryPackId: z.string().uuid().optional(),
  industry: z.nativeEnum(Industry).optional(),
  category: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  includeExtractions: z.boolean().optional(),
});