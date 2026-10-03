/**
 * Cleans a raw customer name for voice-agent readability.
 *
 * Rules:
 *  - 1 part  → use as-is (e.g. "Madhuri")
 *  - 2 parts → use the FIRST name (e.g. "Raj Kumar" → "Raj")
 *  - 3+ parts → use the MIDDLE name, but only if it is a "real" name
 *               (> 3 chars and not an initial like "K", "F", "BD").
 *               If the middle fails validation, fall back to the first name.
 *  - Always title-case the result and trim whitespace.
 */
export function cleanCustomerName(raw: string | undefined | null): string {
  if (!raw) return "";

  const parts = raw.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "";
  if (parts.length === 1) return titleCase(parts[0]);
  if (parts.length === 2) return titleCase(parts[0]);

  // 3 or more parts — try the middle name (index 1)
  const middle = parts[1];

  if (isValidSpokenName(middle)) {
    return titleCase(middle);
  }

  // Middle is an initial or too short — fall back to first name
  return titleCase(parts[0]);
}

/**
 * A "valid spoken name" must be:
 *  - longer than 3 characters  (rejects "K", "F", "BD", "AK")
 *  - not look like an initial  (e.g. single/double uppercase letters)
 */
function isValidSpokenName(name: string): boolean {
  if (name.length <= 3) return false;

  // Reject pure-initial patterns like "AK", "BD", "KMR"
  if (/^[A-Z]{1,3}$/i.test(name)) return false;

  return true;
}

const JUNK_NAMES = new Set([
  "unknown",
  "null",
  "undefined",
  "unavailable",
  "na",
  "n/a",
  "none",
  "test",
  "user",
  "customer",
  "no name",
  "noname",
]);

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Checks if a customer name is valid and conversational (not empty, not junk, not a template tag).
 */
export function isValidCustomerName(name: string | null | undefined): boolean {
  if (!name) return false;

  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return false;

  // Reject template syntax like {{customer_name}}, {name}, <name>, etc.
  if (/^[{<[].*[}>\]]$/.test(trimmed)) {
    return false;
  }

  // Reject common dummy/junk names
  if (JUNK_NAMES.has(trimmed)) {
    return false;
  }

  // Reject if it's purely numbers or special characters
  if (!/[a-zA-Z]/.test(trimmed)) {
    return false;
  }

  return true;
}
