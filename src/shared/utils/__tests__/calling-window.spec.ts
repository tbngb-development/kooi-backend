import { describe, expect, it } from "vitest";
import {
  buildCallingWindowTiming,
  canStartNewDial,
  getNextWindowStart,
  getWindowState,
  resolveCallingWindow,
  type CallingWindow,
  type ResolveCallingWindowInput,
} from "../calling-window";

function requiredWindow(input: ResolveCallingWindowInput): CallingWindow {
  const resolved = resolveCallingWindow(input);
  if (!resolved) throw new Error("Expected a calling window");
  return resolved;
}

const CAMPAIGN_SCHEDULE = {
  allowed_start_time: "09:00",
  allowed_end_time: "21:00",
  allowed_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  timezone: "Asia/Kolkata",
};

const INDUSTRY_HOURS = {
  start: "10:00",
  end: "18:00",
  tz: "Asia/Kolkata",
};

const SARVAM_SCHEDULE = {
  allowed_start_time: "11:00",
  allowed_end_time: "19:00",
  allowed_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  timezone: "Asia/Kolkata",
};

describe("calling window resolution", () => {
  it("prefers a valid campaign schedule over the assistant industry pack", () => {
    const window = resolveCallingWindow({
      campaignSchedule: CAMPAIGN_SCHEDULE,
      provider: "BOLNA",
      industryCallingHours: INDUSTRY_HOURS,
    });

    expect(window).toEqual({
      startTime: "09:00",
      endTime: "21:00",
      timezone: "Asia/Kolkata",
      allowedDays: CAMPAIGN_SCHEDULE.allowed_days,
      source: "campaign",
    });
  });

  it("falls back to the agent source when the campaign schedule is invalid", () => {
    const assistantWindow = resolveCallingWindow({
      campaignSchedule: { allowed_start_time: "bad", allowed_end_time: "21:00" },
      provider: "BOLNA",
      industryCallingHours: INDUSTRY_HOURS,
    });
    const sarvamWindow = resolveCallingWindow({
      campaignSchedule: null,
      provider: "SARVAM",
      sarvamSchedule: SARVAM_SCHEDULE,
      industryCallingHours: INDUSTRY_HOURS,
    });

    expect(assistantWindow?.source).toBe("industry-pack");
    expect(assistantWindow?.startTime).toBe("10:00");
    expect(sarvamWindow?.source).toBe("sarvam-agent");
    expect(sarvamWindow?.startTime).toBe("11:00");
  });

  it("treats an end time at or before the start time as an overnight window", () => {
    const overnightWindow = requiredWindow({
      industryCallingHours: { start: "22:00", end: "06:00", tz: "Asia/Kolkata" },
    });

    expect(overnightWindow).not.toBeNull();
    // 02:00 IST on Nov 24 is 20:30 UTC on Nov 23.
    expect(getWindowState(overnightWindow, new Date("2026-11-23T20:30:00.000Z"))).toBe("OPEN");
    // 07:00 IST on Nov 24 is 01:30 UTC on Nov 24: after the previous
    // overnight window closed and before the next one opens.
    const afterClose = new Date("2026-11-24T01:30:00.000Z");
    expect(getWindowState(overnightWindow, afterClose)).toBe("BEFORE_OPEN");
    expect(canStartNewDial(overnightWindow, afterClose)).toBe(false);
  });
});

describe("calling window state at the boundary", () => {
  const window = requiredWindow({ campaignSchedule: CAMPAIGN_SCHEDULE });

  it("is open at 08:58 PM", () => {
    expect(getWindowState(window, new Date("2026-11-23T15:28:00.000Z"))).toBe("OPEN");
    expect(canStartNewDial(window, new Date("2026-11-23T15:28:00.000Z"))).toBe(true);
  });

  it("is closed at 09:00 PM and blocks new dials", () => {
    const at = new Date("2026-11-23T15:30:00.000Z");
    expect(getWindowState(window, at)).toBe("AFTER_CLOSE");
    expect(canStartNewDial(window, at)).toBe(false);
  });

  it("is closed on a day excluded by allowed_days", () => {
    const weekdayWindow = requiredWindow({
      campaignSchedule: {
        ...CAMPAIGN_SCHEDULE,
        allowed_days: ["Monday"],
      },
    });

    // Mon Nov 23 2026, 10:00 IST.
    expect(getWindowState(weekdayWindow, new Date("2026-11-23T04:30:00.000Z"))).toBe("OPEN");
    // Tue Nov 24 2026, 10:00 IST.
    expect(getWindowState(weekdayWindow, new Date("2026-11-24T04:30:00.000Z"))).toBe("CLOSED_DAY");
  });

  it("allows dials when there is no configured window", () => {
    expect(canStartNewDial(null, new Date("2026-11-23T15:30:00.000Z"))).toBe(true);
  });
});

describe("next window start", () => {
  const window = requiredWindow({ campaignSchedule: CAMPAIGN_SCHEDULE });

  it("returns 09:00 AM the next day before close", () => {
    const at = new Date("2026-11-23T15:28:00.000Z");
    expect(getNextWindowStart(window, at)).toEqual(new Date("2026-11-24T03:30:00.000Z"));
  });
});

describe("parse timing payload", () => {
  it("returns a server timestamp and the effective window", () => {
    const at = new Date("2026-11-23T15:28:00.000Z");
    const timing = buildCallingWindowTiming({
      at,
      campaignSchedule: CAMPAIGN_SCHEDULE,
      provider: "BOLNA",
      industryCallingHours: INDUSTRY_HOURS,
    });

    expect(timing.serverTime).toBe("2026-11-23T15:28:00.000Z");
    expect(timing.effectiveWindow).toEqual({
      startTime: "09:00",
      endTime: "21:00",
      timezone: "Asia/Kolkata",
      allowedDays: CAMPAIGN_SCHEDULE.allowed_days,
      source: "campaign",
    });
  });
});
