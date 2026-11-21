// modules/calls/application/utils/call-export-csv.ts

/** Minimal call shape required to build a contact-list CSV row. */
export interface CallExportEntry {
  status: string;
  startedAt: Date | string | null;
  createdAt: Date | string;
  lead: { id: string; name: string | null; phone: string } | null;
}

const FORMULA_PREFIXES = ["=", "+", "-", "@"];
const CSV_BOM = "\uFEFF";
const CSV_LINE_BREAK = "\r\n";

export const CALL_EXPORT_HEADER = '"Name","Contact Number","Status","Date & Time"';

/** Normalize a phone into a dedupe key. The stored value is already E.164,
 *  but whitespace/dash variants and a leading "+" are collapsed defensively. */
export function normalizePhoneKey(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone
    .trim()
    .replace(/[\s\-()]/g, "")
    .replace(/^\+/, "");
}

function timestampOf(call: CallExportEntry): number {
  const raw = call.startedAt ?? call.createdAt;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

/** Keep the most recent call for each phone. Calls without a lead cannot be
 *  meaningfully deduplicated, so all of them survive. */
export function dedupeLatestCallPerPhone<T extends CallExportEntry>(
  calls: T[],
): T[] {
  const latestByPhone = new Map<string, T>();
  const withoutPhone: T[] = [];

  for (const call of calls) {
    const key = normalizePhoneKey(call.lead?.phone);
    if (!key) {
      withoutPhone.push(call);
      continue;
    }

    const current = latestByPhone.get(key);
    if (!current || timestampOf(call) > timestampOf(current)) {
      latestByPhone.set(key, call);
    }
  }

  return [...latestByPhone.values(), ...withoutPhone].sort(
    (a, b) => timestampOf(b) - timestampOf(a),
  );
}

export function humanizeCallStatus(
  status: string | null | undefined,
): string {
  if (!status) return "";
  return status
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function makeDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  };

  try {
    return new Intl.DateTimeFormat("en-CA", { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat("en-CA", { ...options, timeZone: "UTC" });
  }
}

/** Render an instant as `yyyy-MM-dd HH:mm:ss` in the requested IANA timezone. */
export function formatExportDateTime(
  value: Date | string | null | undefined,
  timeZone: string,
): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = makeDateTimeFormatter(timeZone || "UTC").formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

function escapeCsvField(
  value: string | null | undefined,
  neutralizeFormula = false,
): string {
  let text = value == null ? "" : String(value);
  if (
    neutralizeFormula &&
    FORMULA_PREFIXES.includes(text.trimStart().charAt(0))
  ) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

/** Build a CRLF CSV with a UTF-8 BOM. Only the free-text Name field is
 *  formula-neutralized: phones are backend-normalized E.164 values, statuses
 *  are a fixed enum, and timestamps are generated, so prefixing those would
 *  corrupt the data. */
export function serializeCallsToCsv(
  calls: CallExportEntry[],
  timeZone: string,
): string {
  const lines = [CALL_EXPORT_HEADER];

  for (const call of calls) {
    lines.push(
      [
        escapeCsvField(call.lead?.name, true),
        escapeCsvField(call.lead?.phone),
        escapeCsvField(humanizeCallStatus(call.status)),
        escapeCsvField(formatExportDateTime(call.startedAt, timeZone)),
      ].join(","),
    );
  }

  return `${CSV_BOM}${lines.join(CSV_LINE_BREAK)}`;
}
