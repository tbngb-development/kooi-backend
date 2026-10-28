import { z } from "zod";

export const createPhoneNumberSchema = z.object({
  phoneNumber: z
    .string()
    .min(7, "Phone number is too short")
    .max(20, "Phone number is too long"),
  friendlyName: z.string().max(100).optional().nullable(),
  provider: z
    .enum(["BOLNA", "TWILIO", "PLIVO", "EXOTEL", "VONAGE", "OTHER"])
    .default("BOLNA"),
  capabilities: z.enum(["INBOUND", "OUTBOUND", "BOTH"]).default("BOTH"),
  status: z.enum(["ACTIVE", "INACTIVE", "RELEASED"]).default("ACTIVE"),
  tenantId: z.string().uuid("Invalid tenant ID format").optional().nullable(),
  assistantId: z
    .string()
    .uuid("Invalid assistant ID format")
    .optional()
    .nullable(),
});

export const updatePhoneNumberSchema = z.object({
  friendlyName: z.string().max(100).optional().nullable(),
  provider: z
    .enum(["BOLNA", "TWILIO", "PLIVO", "EXOTEL", "VONAGE", "OTHER"])
    .optional(),
  capabilities: z.enum(["INBOUND", "OUTBOUND", "BOTH"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "RELEASED"]).optional(),
});

export const assignPhoneNumberSchema = z.object({
  tenantId: z.string().uuid("Invalid tenant ID format"),
  assistantId: z
    .string()
    .uuid("Invalid assistant ID format")
    .optional()
    .nullable(),
});

export const listPhoneNumbersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "RELEASED"]).optional(),
  provider: z
    .enum(["BOLNA", "TWILIO", "PLIVO", "EXOTEL", "VONAGE", "OTHER"])
    .optional(),
  capabilities: z.enum(["INBOUND", "OUTBOUND", "BOTH"]).optional(),
  isAssigned: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null || val === "") return undefined;
      if (typeof val === "boolean") return val;
      return val === "true" || val === "1";
    }),
  tenantId: z.string().uuid().optional(),
});

export type CreatePhoneNumberInput = z.infer<typeof createPhoneNumberSchema>;
export type UpdatePhoneNumberInput = z.infer<typeof updatePhoneNumberSchema>;
export type AssignPhoneNumberInput = z.infer<typeof assignPhoneNumberSchema>;
export type ListPhoneNumbersQuery = z.infer<typeof listPhoneNumbersQuerySchema>;
