import { z } from "zod";

const objectiveOptionSchema = z.object({
  value: z.string().min(1),
  condition: z.string().min(1),
});

export const createClassifierDispositionSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200),
  question: z.string().min(1),
  questionType: z.enum(["BOOLEAN", "CHOICE", "MULTI_CHOICE"]),
  objectiveOptions: z.array(objectiveOptionSchema).min(1),
  industryPackId: z.string().uuid().nullable().optional(),
});

export const updateClassifierDispositionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  displayName: z.string().min(1).max(200).optional(),
  question: z.string().min(1).optional(),
  questionType: z.enum(["BOOLEAN", "CHOICE", "MULTI_CHOICE"]).optional(),
  objectiveOptions: z.array(objectiveOptionSchema).min(1).optional(),
  industryPackId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const assignClassifierToAgentSchema = z.object({
  classifierDispositionIds: z.array(z.string().uuid()).min(1),
});

export const testClassifierSchema = z
  .object({
    classifierDispositionIds: z.array(z.string().uuid()).min(1),
    transcriptSource: z.enum(["existing", "custom"]),
    callId: z.string().uuid().optional(),
    customTranscript: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.transcriptSource === "existing") return !!data.callId;
      if (data.transcriptSource === "custom")
        return !!data.customTranscript?.trim();
      return true;
    },
    {
      message:
        "callId is required for 'existing' source, customTranscript for 'custom' source.",
    },
  );

export const listClassifierDispositionsQuerySchema = z.object({
  industryPackId: z.string().uuid().optional(),
  questionType: z.enum(["BOOLEAN", "CHOICE", "MULTI_CHOICE"]).optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listClassifierResultsQuerySchema = z.object({
  campaignId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  status: z
    .enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "SKIPPED"])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
