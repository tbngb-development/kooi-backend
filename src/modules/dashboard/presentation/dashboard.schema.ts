import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, "Must be a valid ISO date")
  .optional();

export const dashboardFiltersSchema = z.object({
  dateFrom: isoDate,
  dateTo: isoDate,
  campaignId: z.string().uuid().optional(),
});

export const timeSeriesFiltersSchema = dashboardFiltersSchema.extend({
  granularity: z.enum(["daily", "weekly", "monthly"]).default("daily"),
});

export const topCampaignsQuerySchema = dashboardFiltersSchema.extend({
  metric: z
    .enum(["qualified_leads", "total_calls", "total_spend"])
    .default("qualified_leads"),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export type DashboardFiltersQuery = z.infer<typeof dashboardFiltersSchema>;
export type TimeSeriesFiltersQuery = z.infer<typeof timeSeriesFiltersSchema>;
export type TopCampaignsQuery = z.infer<typeof topCampaignsQuerySchema>;
