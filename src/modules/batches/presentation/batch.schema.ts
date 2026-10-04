import { z } from "zod";

export const scheduleBatchSchema = z.object({
  scheduledAt: z
    .string()
    .min(1, "scheduledAt is required (ISO 8601 with timezone)"),
});

export const createBatchBodySchema = z.object({
  termsAccepted: z
    .string()
    .transform((val) => val === "true")
    .pipe(
      z.literal(true, {
        message: "You must accept the Terms & Conditions to upload leads.",
      }),
    ),
  termsVersion: z.string().min(1).max(20),
  scheduledAt: z.string().optional(),
  runImmediately: z.string().optional(),
  retryConfig: z.string().optional(),
});

export const retryConfigSchema = z.object({
  enabled: z.boolean(),
  max_retries: z.number().int().min(0).max(5),
  retry_on_statuses: z
    .array(z.enum(["no-answer", "busy", "failed"]))
    .optional(),
  retry_on_voicemail: z.boolean().optional(),
  retry_intervals_minutes: z.array(z.number().int().positive()).optional(),
});

// ── Manual Batch Entry ─────────────────────────────────────────────────────

export const manualLeadSchema = z.object({
  contact_number: z
    .string()
    .min(1, "contact_number is required")
    .max(20, "contact_number is too long"),
  customer_name: z.string().min(1).max(100).optional(),
});

export const createManualBatchBodySchema = z.object({
  termsAccepted: z.literal(true, {
    message: "You must accept the Terms & Conditions to submit leads.",
  }),
  termsVersion: z.string().min(1).max(20),
  scheduledAt: z.string().optional(),
  runImmediately: z.boolean().optional(),
  retryConfig: retryConfigSchema.optional(),
  leads: z
    .array(manualLeadSchema)
    .min(1, "At least one lead is required")
    .max(1000, "Maximum 1000 leads per manual submission"),
});

export type CreateManualBatchBody = z.infer<typeof createManualBatchBodySchema>;

export type CreateBatchBody = z.infer<typeof createBatchBodySchema>;

export type RetryConfigBody = z.infer<typeof retryConfigSchema>;
