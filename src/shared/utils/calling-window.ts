import { TZDate } from "@date-fns/tz";

const DEFAULT_TIMEZONE = "Asia/Kolkata";
const MINUTES_PER_DAY = 24 * 60;

const ALL_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type CallingWindowSource = "campaign" | "industry-pack" | "sarvam-agent";

export type CallingWindowState =
  | "OPEN"
  | "BEFORE_OPEN"
  | "AFTER_CLOSE"
  | "CLOSED_DAY";

export interface CallingWindow {
  startTime: string;
  endTime: string;
  timezone: string;
  allowedDays: string[];
  source: CallingWindowSource;
}

export interface CallingWindowTiming {
  serverTime: string;
  effectiveWindow: CallingWindow | null;
}

export interface CallingWindowBounds {
  start: Date;
  end: Date;
  isOvernight: boolean;
}

export interface ResolveCallingWindowInput {
  campaignSchedule?: unknown;
  provider?: string | null;
  industryCallingHours?: unknown;
  sarvamSchedule?: unknown;
}

interface TimeOfDay {
  raw: string;
  minutes: number;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseTimeOfDay(value: unknown): TimeOfDay | null {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return null;
  }
  const [hour, minute] = value.split(":").map(Number);
  return { raw: value, minutes: hour * 60 + minute };
}

function normalizeTimezone(value: unknown): string | null {
  const timezone = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return null;
  }
}

function normalizeAllowedDays(value: unknown): string[] | null {
  if (value === undefined || value === null) return [...ALL_DAYS];
  if (!Array.isArray(value) || value.length === 0) return [...ALL_DAYS];

  const normalized = value.map((day) =>
    typeof day === "string"
      ? day.charAt(0).toUpperCase() + day.slice(1).toLowerCase()
      : "",
  );
  if (normalized.some((day) => !ALL_DAYS.includes(day as (typeof ALL_DAYS)[number]))) {
    return null;
  }
  return ALL_DAYS.filter((day) => normalized.includes(day));
}

function fromSchedule(
  value: unknown,
  source: CallingWindowSource,
): CallingWindow | null {
  const schedule = asRecord(value);
  if (!schedule) return null;

  const start = parseTimeOfDay(schedule.allowed_start_time ?? schedule.allowedStartTime);
  const end = parseTimeOfDay(schedule.allowed_end_time ?? schedule.allowedEndTime);
  const timezone = normalizeTimezone(schedule.timezone);
  const allowedDays = normalizeAllowedDays(schedule.allowed_days ?? schedule.allowedDays);
  if (!start || !end || !timezone || !allowedDays) return null;

  return {
    startTime: start.raw,
    endTime: end.raw,
    timezone,
    allowedDays,
    source,
  };
}

function fromIndustryHours(value: unknown): CallingWindow | null {
  const hours = asRecord(value);
  if (!hours) return null;

  const start = parseTimeOfDay(hours.start);
  const end = parseTimeOfDay(hours.end);
  const timezone = normalizeTimezone(hours.tz ?? hours.timezone);
  if (!start || !end || !timezone) return null;

  return {
    startTime: start.raw,
    endTime: end.raw,
    timezone,
    allowedDays: [...ALL_DAYS],
    source: "industry-pack",
  };
}

/**
 * D1: an explicit campaign override wins; otherwise the agent's own source
 * supplies the window (industry pack for assistants, schedule for Sarvam).
 */
export function resolveCallingWindow(
  input: ResolveCallingWindowInput,
): CallingWindow | null {
  if (input.campaignSchedule) {
    const campaignWindow = fromSchedule(input.campaignSchedule, "campaign");
    if (campaignWindow) return campaignWindow;
  }

  if (input.provider === "SARVAM") {
    return input.sarvamSchedule
      ? fromSchedule(input.sarvamSchedule, "sarvam-agent")
      : null;
  }

  return input.industryCallingHours
    ? fromIndustryHours(input.industryCallingHours)
    : null;
}

function toNativeDate(value: TZDate): Date {
  return new Date(value.getTime());
}

function zonedParts(value: Date, timezone: string): ZonedParts {
  const zoned = new TZDate(value, timezone);
  return {
    year: zoned.getFullYear(),
    month: zoned.getMonth(),
    day: zoned.getDate(),
    weekday: zoned.getDay(),
  };
}

function makeZonedDate(
  parts: ZonedParts,
  dayOffset: number,
  timeOfDayMinutes: number,
  timezone: string,
): TZDate {
  const hour = Math.floor(timeOfDayMinutes / 60);
  const minute = timeOfDayMinutes % 60;
  return new TZDate(
    parts.year,
    parts.month,
    parts.day + dayOffset,
    hour,
    minute,
    0,
    0,
    timezone,
  );
}

function weekdayName(date: Date, timezone: string): string {
  return WEEKDAYS[zonedParts(date, timezone).weekday];
}

/** D6: end <= start means the window crosses midnight. */
export function getWindowBounds(
  window: CallingWindow,
  at: Date,
): CallingWindowBounds {
  const start = parseTimeOfDay(window.startTime);
  const end = parseTimeOfDay(window.endTime);
  if (!start || !end) throw new Error("Calling window has invalid times");

  const parts = zonedParts(at, window.timezone);
  const isOvernight = end.minutes <= start.minutes;
  const startOn = (offset: number) =>
    makeZonedDate(parts, offset, start.minutes, window.timezone);
  const endOn = (offset: number) =>
    makeZonedDate(
      parts,
      offset,
      isOvernight ? end.minutes + MINUTES_PER_DAY : end.minutes,
      window.timezone,
    );

  if (isOvernight) {
    const previousStart = startOn(-1);
    const previousEnd = endOn(-1);
    if (
      at.getTime() >= previousStart.getTime() &&
      at.getTime() < previousEnd.getTime()
    ) {
      return {
        start: toNativeDate(previousStart),
        end: toNativeDate(previousEnd),
        isOvernight: true,
      };
    }

    const currentStart = startOn(0);
    const currentEnd = endOn(0);
    if (
      at.getTime() >= currentStart.getTime() &&
      at.getTime() < currentEnd.getTime()
    ) {
      return {
        start: toNativeDate(currentStart),
        end: toNativeDate(currentEnd),
        isOvernight: true,
      };
    }

    return {
      start: toNativeDate(currentStart),
      end: toNativeDate(currentEnd),
      isOvernight: true,
    };
  }

  return {
    start: toNativeDate(startOn(0)),
    end: toNativeDate(endOn(0)),
    isOvernight: false,
  };
}

export function getWindowState(
  window: CallingWindow,
  at: Date,
): CallingWindowState {
  const bounds = getWindowBounds(window, at);
  if (!window.allowedDays.includes(weekdayName(bounds.start, window.timezone))) {
    return "CLOSED_DAY";
  }
  if (at.getTime() >= bounds.start.getTime() && at.getTime() < bounds.end.getTime()) {
    return "OPEN";
  }
  return at.getTime() < bounds.start.getTime() ? "BEFORE_OPEN" : "AFTER_CLOSE";
}

/** D2/D4: no new dials outside the window; in-flight calls are not considered here. */
export function canStartNewDial(
  window: CallingWindow | null,
  at: Date,
): boolean {
  if (!window) return true;
  return getWindowState(window, at) === "OPEN";
}

/** Returns the next allowed start; for an open window this is after it closes. */
export function getNextWindowStart(
  window: CallingWindow,
  at: Date,
): Date | null {
  const state = getWindowState(window, at);
  const bounds = getWindowBounds(window, at);
  if (state === "BEFORE_OPEN") return bounds.start;

  const earliest = state === "OPEN" ? bounds.end.getTime() : at.getTime();
  const parts = zonedParts(at, window.timezone);
  const start = parseTimeOfDay(window.startTime);
  if (!start) return null;

  for (let offset = -1; offset <= 8; offset += 1) {
    const candidate = makeZonedDate(parts, offset, start.minutes, window.timezone);
    if (
      candidate.getTime() > earliest &&
      window.allowedDays.includes(weekdayName(toNativeDate(candidate), window.timezone))
    ) {
      return toNativeDate(candidate);
    }
  }
  return null;
}

/** D3: where pending work at or after window close should be carried. */
export function getCarryForwardWindowStart(
  window: CallingWindow | null,
  at: Date,
): Date | null {
  return window ? getNextWindowStart(window, at) : null;
}

export interface BuildCallingWindowTimingInput extends ResolveCallingWindowInput {
  at?: Date;
}

export function buildCallingWindowTiming({
  at,
  campaignSchedule,
  provider,
  industryCallingHours,
  sarvamSchedule,
}: BuildCallingWindowTimingInput): CallingWindowTiming {
  const serverTime = at && !Number.isNaN(at.getTime()) ? at : new Date();
  return {
    serverTime: serverTime.toISOString(),
    effectiveWindow: resolveCallingWindow({
      campaignSchedule,
      provider,
      industryCallingHours,
      sarvamSchedule,
    }),
  };
}
