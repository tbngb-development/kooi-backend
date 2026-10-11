import { z } from "zod";

export const exportCallCenterCsvQuerySchema = z.object({
  source: z.enum(["CAMPAIGN", "INBOUND", "QUICK_DIAL"]).optional(),
  status: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.iso.datetime({ message: "Invalid dateFrom format" }).optional(),
  dateTo: z.iso.datetime({ message: "Invalid dateTo format" }).optional(),
});

export type ExportCallCenterCsvQuery = z.infer<
  typeof exportCallCenterCsvQuerySchema
>;
