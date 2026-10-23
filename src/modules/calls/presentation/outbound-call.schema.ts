// modules/calls/presentation/outbound-call.schema.ts

import { z } from "zod";
import { E164_PHONE_REGEX } from "../../leads/domain/rules/phone.rules";

export const initiateOutboundCallSchema = z.object({
  phoneNumber: z
    .string({ message: "phoneNumber is required" })
    .trim()
    .min(1, "phoneNumber cannot be empty")
    .regex(
      E164_PHONE_REGEX,
      "phoneNumber must be in valid E.164 format (e.g. +919876543210)",
    ),
  name: z.string().trim().optional(),
  assistantId: z.string().uuid("Invalid assistant ID"),
});

export type InitiateOutboundCallRequest = z.infer<
  typeof initiateOutboundCallSchema
>;
