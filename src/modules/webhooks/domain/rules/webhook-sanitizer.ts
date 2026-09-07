import {
  type Disposition,
  type LeadTemperature,
  type PurchaseTimeline,
  type PurchasePurpose,
  type LocationMatch,
  type PreferredNextAction,
  type ContactChannel,
  type ExtractionFlag,
} from "@prisma/client";

// ── Allowed enum values matching generated Prisma definitions ────────────────

export const DISPOSITION_VALUES: Disposition[] = [
  "INTERESTED_SEND_DETAILS",
  "QUALIFIED_CONSULTANT_FOLLOWUP",
  "SITE_VISIT_INTEREST",
  "INTERESTED_GENERAL",
  "FOLLOWUP_REQUESTED",
  "NOT_INTERESTED",
  "DO_NOT_CALL",
  "WRONG_NUMBER",
  "ALREADY_PURCHASED",
  "BROKER",
  "LANGUAGE_CALLBACK_REQUIRED",
  "CALL_ENDED_BY_CUSTOMER",
  "CALL_ENDED_ABUSIVE",
  "NO_RESPONSE",
  "CALL_DROPPED",
];

export const LEAD_TEMPERATURE_VALUES: LeadTemperature[] = [
  "HOT",
  "WARM",
  "NURTURE",
  "COLD",
  "NOT_APPLICABLE",
];

export const PURCHASE_TIMELINE_VALUES: PurchaseTimeline[] = [
  "WITHIN_3_MONTHS",
  "WITHIN_6_MONTHS",
  "WITHIN_1_YEAR",
  "AFTER_1_YEAR",
  "FLEXIBLE",
  "NOT_SHARED",
];

export const PURCHASE_PURPOSE_VALUES: PurchasePurpose[] = [
  "OWN_USE",
  "INVESTMENT",
  "BOTH",
  "NOT_SHARED",
];

export const PREFERRED_NEXT_ACTION_VALUES: PreferredNextAction[] = [
  "SEND_DETAILS",
  "CONSULTANT_CALL",
  "SITE_VISIT",
  "FOLLOWUP_CALL",
  "NONE",
];

export const CONTACT_CHANNEL_VALUES: ContactChannel[] = [
  "WHATSAPP",
  "EMAIL",
  "NOT_ASKED",
];

export const LOCATION_MATCH_VALUES: LocationMatch[] = [
  "MATCH",
  "MISMATCH",
  "NOT_ASKED",
  "NOT_MENTIONED",
];

export const EXTRACTION_FLAG_VALUES: ExtractionFlag[] = ["YES", "NO"];

/**
 * Validates and normalizes string inputs into strict Prisma enums.
 * Returns null if the value doesn't match the whitelisted enum set.
 */
export function sanitizeEnum<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
): T | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase() as T;
  return allowed.includes(upper) ? upper : null;
}
