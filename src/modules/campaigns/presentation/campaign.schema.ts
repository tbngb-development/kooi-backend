// modules/campaigns/presentation/campaign.schema.ts

import { z } from "zod";

export const createCampaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required").max(200),
  description: z.string().max(2000).optional(),
  assistantId: z.string().uuid("Invalid assistant ID"),
  variables: z.record(z.string(), z.string()).optional(),
  defaultRetryConfig: z
    .object({
      enabled: z.boolean(),
      max_retries: z.number().int().min(0).max(5).optional(),
      retry_on_statuses: z
        .array(z.enum(["no-answer", "busy", "failed"]))
        .optional(),
      retry_on_voicemail: z.boolean().optional(),
      retry_intervals_minutes: z.array(z.number().int().positive()).optional(),
    })
    .optional(),
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

export type ParseManualLeadsBody = z.infer<typeof parseManualLeadsSchema>;

export type CreateCampaignBody = z.infer<typeof createCampaignSchema>;
export type ListCampaignsQuery = z.infer<typeof listCampaignsQuerySchema>;
export type ExtractVariablesBody = z.infer<typeof extractVariablesSchema>;
