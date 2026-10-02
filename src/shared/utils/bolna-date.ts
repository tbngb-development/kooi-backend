/**
 * Converts a Date to Bolna-compatible ISO 8601 string with numeric UTC offset.
 * Bolna rejects the "Z" suffix — it requires "+05:30" style offsets.
 */
export function toBolnaISO(date: Date): string {
  const offsetHours = 5;
  const offsetMinutes = 30;
  const totalOffsetMs = (offsetHours * 60 + offsetMinutes) * 60 * 1000;

  const localDate = new Date(date.getTime() + totalOffsetMs);
  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(localDate.getUTCDate()).padStart(2, "0");
  const hours = String(localDate.getUTCHours()).padStart(2, "0");
  const mins = String(localDate.getUTCMinutes()).padStart(2, "0");
  const secs = String(localDate.getUTCSeconds()).padStart(2, "0");

  const sign = offsetHours >= 0 ? "+" : "-";
  const absH = String(Math.abs(offsetHours)).padStart(2, "0");
  const absM = String(Math.abs(offsetMinutes)).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${mins}:${secs}${sign}${absH}:${absM}`;
}

/**
 * Parses a Bolna state string like "scheduled at 2026-06-23T18:30:00+05:30"
 * into a Date object. Returns null if parsing fails.
 */
export function parseBolnaScheduledTime(stateString: string): Date | null {
  const match = stateString.match(
    /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2})/,
  );
  if (!match) return null;
  const parsed = new Date(match[1]);
  return isNaN(parsed.getTime()) ? null : parsed;
}
