import { z } from "zod";

export const dynamicFiltersSchema = z
  .string()
  .optional()
  .transform((val) => {
    if (!val) return undefined;
    try {
      const parsed = JSON.parse(val);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return undefined;
      }
      return parsed as Record<string, string>;
    } catch {
      return undefined;
    }
  });

// Update listCallsQuerySchema to include dynamicFilters
export const listCallsQuerySchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID").optional(),
  leadId: z.string().uuid("Invalid lead ID").optional(),
  status: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.iso.datetime({ message: "Invalid dateFrom format" }).optional(),
  dateTo: z.string().datetime({ message: "Invalid dateTo format" }).optional(),
  sortBy: z.enum(["startedAt", "duration", "cost", "createdAt"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  page: z
    .preprocess((val) => Number(val), z.number().int().positive())
    .optional(),
  limit: z
    .preprocess((val) => Number(val), z.number().int().positive())
    .optional(),
  dynamicFilters: dynamicFiltersSchema,
});

export const getCallStatsQuerySchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID").optional(),
  leadId: z.string().uuid("Invalid lead ID").optional(),
});

export const adminListCallsQuerySchema = listCallsQuerySchema.extend({
  tenantId: z.string().uuid("Invalid tenant ID"),
});

export const adminGetCallStatsQuerySchema = getCallStatsQuerySchema.extend({
  tenantId: z.string().uuid("Invalid tenant ID"),
});

export const availableFiltersQuerySchema = z.object({
  campaignId: z.string().uuid("Campaign ID is required"),
});

export type AdminListCallsQuery = z.infer<typeof adminListCallsQuerySchema>;
export type AdminGetCallStatsQuery = z.infer<
  typeof adminGetCallStatsQuerySchema
>;

export type ListCallsQuery = z.infer<typeof listCallsQuerySchema>;
export type GetCallStatsQuery = z.infer<typeof getCallStatsQuerySchema>;

export type AvailableFiltersQuery = z.infer<typeof availableFiltersQuerySchema>;
