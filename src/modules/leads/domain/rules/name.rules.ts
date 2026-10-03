// ── Recognized Prefixes & Junk Names ─────────────────────────────────────────

const HONORIFICS_AND_PREFIXES = new Set([
  // Titles / Honorifics
  "mr",
  "mrs",
  "ms",
  "miss",
  "dr",
  "prof",
  "er",
  "adv",
  "shri",
  "smt",
]);

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function titleCase(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Determines if a single word is an initial or abbreviation rather than a spoken name.
 */
function isInitialOrPrefix(word: string): boolean {
  const lower = word.toLowerCase();

  // 1. Matches common prefixes
  if (HONORIFICS_AND_PREFIXES.has(lower)) return true;

  // 2. 1 or 2 letter tokens are initials ("K", "Ab", "Ls", "FF")
  if (lower.length <= 2) return true;

  // 3. 3-letter tokens with no vowels are abbreviations (e.g. "mdd", "kmr", "skk")
  //    (Allows valid 3-letter names like "Raj", "Ali", "Sam", "Dev", "Uma", "Joy")
  const hasVowel = /[aeiouy]/i.test(lower);
  if (!hasVowel) return true;

  return false;
}

// ── Main Functions ───────────────────────────────────────────────────────────

/**
 * Checks if a customer name is valid and conversational (not empty, not junk, not a template tag).
 */
export function isValidCustomerName(name: string | null | undefined): boolean {
  if (!name) return false;

  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return false;

  // Reject template syntax like {{customer_name}}, {name}, <name>, [name], etc.
  // Fixed: Removed unnecessary escapes inside [...]
  if (/^[{<([].*[}>)\]]$/.test(trimmed)) return false;

  // Reject common dummy/junk names
  if (JUNK_NAMES.has(trimmed)) return false;

  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(trimmed)) return false;

  return true;
}

/**
 * Cleans a raw customer name for voice-agent readability.
 * Finds and title-cases the FIRST real, conversational name token.
 */
export function cleanCustomerName(raw: string | undefined | null): string {
  if (!isValidCustomerName(raw)) return "";

  // Fixed: Replaces all punctuation and special characters with spaces cleanly
  // "Md. Abbas-Firdous" -> "Md  Abbas Firdous"
  const sanitized = raw!.replace(/[^\w\s]/g, " ").trim();

  const parts = sanitized.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";

  // Find the first valid spoken name that is NOT an initial/prefix
  for (const part of parts) {
    if (!isInitialOrPrefix(part)) {
      return titleCase(part);
    }
  }

  // Fallback: if all words were initials (e.g. "R K"), return the last token
  return titleCase(parts[parts.length - 1]);
}
