import {
  InvalidDateRangeError,
  MaxDateRangeExceededError,
} from "../errors/dashboard.errors";

export type Granularity = "daily" | "weekly" | "monthly";

export interface DateRange {
  from: Date;
  to: Date;
}

const MAX_RANGE_MS = 365 * 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;

export const PG_GRANULARITY: Record<Granularity, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
};

export function parseDateRange(dateFrom?: string, dateTo?: string): DateRange {
  const now = new Date();

  const to = dateTo ? new Date(dateTo) : now;
  const from = dateFrom
    ? new Date(dateFrom)
    : new Date(now.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new InvalidDateRangeError("Invalid date format. Use ISO 8601.");
  }

  if (from > to) {
    throw new InvalidDateRangeError();
  }

  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    throw new MaxDateRangeExceededError();
  }

  // Use UTC to align with PostgreSQL's timestamptz storage
  from.setUTCHours(0, 0, 0, 0);
  to.setUTCHours(23, 59, 59, 999);

  return { from, to };
}

export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Normalize any Date/string to "YYYY-MM-DD" UTC string.
 * This is the single source of truth for bucket key format.
 */
export function toDateString(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().split("T")[0];
}

export function generateDateBuckets(
  from: Date,
  to: Date,
  granularity: Granularity,
): string[] {
  const buckets: string[] = [];
  const current = new Date(from);
  current.setUTCHours(0, 0, 0, 0);

  while (current <= to) {
    buckets.push(toDateString(current));

    switch (granularity) {
      case "daily":
        current.setUTCDate(current.getUTCDate() + 1);
        break;
      case "weekly":
        current.setUTCDate(current.getUTCDate() + 7);
        break;
      case "monthly":
        current.setUTCMonth(current.getUTCMonth() + 1);
        break;
    }
  }

  return buckets;
}
