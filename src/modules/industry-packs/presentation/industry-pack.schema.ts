import { z } from "zod";

export const createIndustryPackSchema = z.object({
  slug: z.string().min(3).max(60).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  allowedCallingHours: z
    .object({
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
      tz: z.string().min(1),
    })
    .nullable()
    .optional(),
  requiresConsent: z.boolean().optional(),
});

export const updateIndustryPackSchema = z.object({
  slug: z.string().min(3).max(60).regex(/^[a-z0-9-]+$/).optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  allowedCallingHours: z
    .object({
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
      tz: z.string().min(1),
    })
    .nullable()
    .optional(),
  requiresConsent: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const assignAgentSchema = z.object({
  agentId: z.string().uuid(),
});

export const listIndustryPacksQuerySchema = z.object({
  isActive: z.preprocess(
    (val) => (val === "true" ? true : val === "false" ? false : undefined),
    z.boolean().optional(),
  ),
});