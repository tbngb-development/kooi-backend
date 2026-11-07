// modules/campaigns/presentation/campaign.schema.ts

import { z } from "zod";

export const campaignRetryConfigSchema = z.object({
  enabled: z.boolean(),
  max_retries: z.number().int().min(0).max(5).optional(),
  retry_on_statuses: z
    .array(z.enum(["no-answer", "busy", "failed"]))
    .optional(),
  retry_on_voicemail: z.boolean().optional(),
  retry_intervals_minutes: z.array(z.number().int().positive()).optional(),
});

export const allowedScheduleSchema = z.object({
  allowed_start_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid HH:MM 24-hour format"),
  allowed_end_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid HH:MM 24-hour format"),
  allowed_days: z
    .array(
      z.enum([
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ]),
    )
    .min(1, "At least one day must be allowed"),
  timezone: z.string().optional().default("Asia/Kolkata"),
});

export const createCampaignSchema = z
  .object({
    name: z.string().min(1, "Campaign name is required").max(200),
    description: z.string().max(2000).optional(),
    assistantId: z.string().uuid("Invalid assistant ID").optional(),
    sarvamAgentId: z.string().uuid("Invalid Sarvam agent ID").optional(),
    startTimestamp: z
      .string()
      .datetime({ message: "Invalid start timestamp format" })
      .optional(),
    endTimestamp: z
      .string()
      .datetime({ message: "Invalid end timestamp format" })
      .optional(),
    allowedSchedule: allowedScheduleSchema.optional(),
    variables: z.record(z.string(), z.string()).optional(),
    defaultRetryConfig: campaignRetryConfigSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.sarvamAgentId) {
      if (data.startTimestamp && data.endTimestamp) {
        if (new Date(data.endTimestamp) <= new Date(data.startTimestamp)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["endTimestamp"],
            message: "endTimestamp must be after startTimestamp",
          });
        }
      }
    } else if (!data.assistantId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assistantId"],
        message: "Either assistantId or sarvamAgentId is required",
      });
    }
  });

export const listCampaignsQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.string().optional(),
  dateFrom: z
    .string()
    .datetime({ message: "Invalid dateFrom format" })
    .optional(),
  dateTo: z.string().datetime({ message: "Invalid dateTo format" }).optional(),
  sortBy: z.enum(["createdAt", "totalLeads"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  isDeleted: z
    .preprocess((val) => val === "true" || val === true, z.boolean())
    .optional()
    .default(false),
});

export const extractVariablesSchema = z.object({
  assistantId: z.uuid("Invalid assistant ID"),
});

// ── Manual Leads Parsing / Preview ─────────────────────────────────────────

export const parseManualLeadsSchema = z.object({
  leads: z
    .array(
      z.object({
        contact_number: z
          .string()
          .min(1, "contact_number is required")
          .max(20, "contact_number is too long"),
        customer_name: z.string().min(1).max(100).optional(),
      }),
    )
    .min(1, "At least one lead is required")
    .max(1000, "Maximum 1000 leads per manual submission"),
});

export const updateCampaignSchema = z.object({
  name: z.string().trim().min(1, "Campaign name cannot be empty").max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  platformAgentId: z.string().uuid("Invalid platform agent ID").optional(),
  assistantId: z.string().uuid("Invalid assistant ID").optional(),
  sarvamAgentId: z.string().uuid("Invalid Sarvam agent ID").optional(),
  startTimestamp: z.string().datetime().nullable().optional(),
  endTimestamp: z.string().datetime().nullable().optional(),
  allowedSchedule: allowedScheduleSchema.nullable().optional(),
  variables: z.record(z.string(), z.string()).optional(),
  defaultRetryConfig: campaignRetryConfigSchema.nullable().optional(),
  retryConfig: campaignRetryConfigSchema.nullable().optional(),
  retry: campaignRetryConfigSchema.nullable().optional(),
});

export const updateDraftCampaignSchema = updateCampaignSchema;

export const updateCampaignStatusSchema = z.object({
  status: z.enum([
    "DRAFT",
    "SCHEDULED",
    "RUNNING",
    "PAUSED",
    "COMPLETED",
    "CANCELLED",
    "FAILED",
  ]),
  cascadeToBatches: z.boolean().optional().default(true),
});

export type UpdateCampaignBody = z.infer<typeof updateCampaignSchema>;
export type UpdateDraftCampaignBody = UpdateCampaignBody;
export type UpdateCampaignStatusBody = z.infer<typeof updateCampaignStatusSchema>;

export type ParseManualLeadsBody = z.infer<typeof parseManualLeadsSchema>;

export type CreateCampaignBody = z.infer<typeof createCampaignSchema>;
export type ListCampaignsQuery = z.infer<typeof listCampaignsQuerySchema>;
export type ExtractVariablesBody = z.infer<typeof extractVariablesSchema>;

export const controlSarvamCampaignSchema = z.object({
  action: z.enum(["pause", "resume", "cancel"]),
});
export type ControlSarvamCampaignBody = z.infer<typeof controlSarvamCampaignSchema>;

export const campaignGoalMetricsQuerySchema = z.object({
  batchId: z.string().uuid("Invalid batch ID").optional(),
});
export type CampaignGoalMetricsQuery = z.infer<typeof campaignGoalMetricsQuerySchema>;
