import {
  isValidE164,
  normalizePhoneNumber,
} from "../../../leads/domain/rules/phone.rules";

export { isValidE164, normalizePhoneNumber };

export function validatePhoneNumberFormat(phone: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  if (!phone || typeof phone !== "string") {
    return {
      valid: false,
      normalized: "",
      error: "Phone number is required",
    };
  }

  const normalized = normalizePhoneNumber(phone);
  if (!isValidE164(normalized)) {
    return {
      valid: false,
      normalized,
      error: "Phone number must be a valid E.164 international format (e.g., +919876543210)",
    };
  }

  return {
    valid: true,
    normalized,
  };
}
