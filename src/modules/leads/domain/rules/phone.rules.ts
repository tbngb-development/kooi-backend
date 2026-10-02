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
  const cleaned = raw.replace(/[\s\-().]/g, "");

  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  if (cleaned.startsWith("00")) {
    return `+${cleaned.slice(2)}`;
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
