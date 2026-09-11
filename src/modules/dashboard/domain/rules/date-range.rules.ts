import {
  InvalidDateRangeError,
  MaxDateRangeExceededError,
} from "../errors/dashboard.errors";

export type Granularity = "daily" | "weekly" | "monthly";

export interface DateRange {
  from: Date;
  to: Date;
}

const MAX_RANGE_MS = 365 * 24 * 60 * 60 * 1000; // 12 months
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

  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  return { from, to };
}

export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function generateDateBuckets(
  from: Date,
  to: Date,
  granularity: Granularity,
): string[] {
  const buckets: string[] = [];
  const current = new Date(from);
  current.setHours(0, 0, 0, 0);

  while (current <= to) {
    buckets.push(current.toISOString().split("T")[0]);

    switch (granularity) {
      case "daily":
        current.setDate(current.getDate() + 1);
        break;
      case "weekly":
        current.setDate(current.getDate() + 7);
        break;
      case "monthly":
        current.setMonth(current.getMonth() + 1);
        break;
    }
  }

  return buckets;
}
