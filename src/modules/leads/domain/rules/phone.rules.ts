/**
 * ITU-T E.164 international phone number format:
 * - Starts with '+'
 * - Followed by 1-3 digit country code (first digit 1-9)
 * - Followed by subscriber number
 * - Total length of digits: 7 to 15
 */
export const E164_PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * Checks if a string is a valid E.164 international phone number.
 */
export function isValidE164(phone: string): boolean {
  if (!phone) return false;
  return E164_PHONE_REGEX.test(phone.trim());
}

/**
 * Normalizes raw phone strings into E.164 format.
 *
 * Extracted from the Bolna client so it can be shared across
 * CSV transformation, lead parsing, and Bolna API calls without
 * coupling those modules to the Bolna client directly.
 */
export function normalizePhoneNumber(
  raw: string,
  defaultCountryCode = "91",
): string {
  let cleaned = raw.replace(/[\s\-().]/g, "");

  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  if (cleaned.startsWith("00")) {
    return `+${cleaned.slice(2)}`;
  }

  // Handle Indian domestic trunk prefix '0' (e.g., 09876543210 -> 9876543210)
  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1);
  }

  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return `+${cleaned}`;
  }

  if (cleaned.length === 10) {
    return `+${defaultCountryCode}${cleaned}`;
  }

  console.warn(
    `[PhoneNormalizer] Ambiguous phone "${raw}" → sending as "+${cleaned}"`,
  );
  return `+${cleaned}`;
}

/**
 * Checks if a normalized or sanitized phone number is a valid Indian number:
 * - 10 digits (domestic without +91)
 * - 12 digits starting with 91 / +91
 */
export function isIndianPhone(phone: string): boolean {
  if (!phone) return false;
  const digits = phone.replace("+", "");
  if (digits.length === 10) return true;
  if (digits.length === 12 && digits.startsWith("91")) return true;
  return false;
}

