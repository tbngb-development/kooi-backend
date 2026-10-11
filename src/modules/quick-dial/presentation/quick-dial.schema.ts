import { z } from "zod";

/**
 * POST /quick-dial – flat body schema
 */
export const initiateQuickDialSchema = z.object({
  assistantId: z.string().uuid("Invalid assistant ID format"),
  recipientPhone: z
    .string()
    .min(10, "Phone number must have at least 10 digits")
    .max(20, "Phone number is too long"),
  leadId: z.string().uuid("Invalid lead ID format").optional(),
  fromPhoneNumber: z.string().optional(),
  userData: z.record(z.string(), z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const quickDialContactSchema = z.object({
  recipientPhone: z
    .string()
    .min(10, "Phone number must have at least 10 digits")
    .max(20, "Phone number is too long"),
  leadId: z.string().uuid("Invalid lead ID format").optional(),
  customerName: z.string().max(100).optional(),
  userData: z.record(z.string(), z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const initiateBatchQuickDialSchema = z.object({
  assistantId: z.string().uuid("Invalid assistant ID format"),
  fromPhoneNumber: z.string().optional(),
  contacts: z
    .array(quickDialContactSchema)
    .min(1, "At least 1 contact must be provided")
    .max(50, "Batch quick dial is limited to a maximum of 50 contacts per batch"),
});


/**
 * GET /quick-dial – query string schema
 */
export const listQuickDialJobsQuerySchema = z.object({
  assistantId: z.string().uuid().optional(),
  status: z
    .enum(["PENDING", "INITIATED", "COMPLETED", "FAILED", "CANCELLED"])
    .optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
