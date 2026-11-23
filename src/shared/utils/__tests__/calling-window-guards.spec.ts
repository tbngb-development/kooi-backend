import { describe, expect, it } from "vitest";
import { evaluateNewDial } from "../calling-window-guards";
import {
  resolveCallingWindow,
  type CallingWindow,
  type ResolveCallingWindowInput,
} from "../calling-window";

function requiredWindow(input: ResolveCallingWindowInput): CallingWindow {
  const resolved = resolveCallingWindow(input);
  if (!resolved) throw new Error("Expected a calling window");
  return resolved;
}

const window = requiredWindow({
  campaignSchedule: {
    allowed_start_time: "09:00",
    allowed_end_time: "21:00",
    allowed_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    timezone: "Asia/Kolkata",
  },
});

describe("evaluateNewDial", () => {
  it("allows a new dial when there is no configured window", () => {
    expect(evaluateNewDial(null, new Date("2026-01-01T22:00:00.000Z"))).toEqual({
      allowed: true,
    });
  });

  it("allows a new dial inside the window", () => {
    expect(evaluateNewDial(window, new Date("2026-01-01T10:00:00.000Z"))).toEqual({
      allowed: true,
    });
  });

  it("blocks a new dial after close and suggests the next morning", () => {
    const result = evaluateNewDial(
      window,
      new Date("2026-01-01T16:00:00.000Z"), // 21:30 IST
    );

    expect(result).toMatchObject({
      allowed: false,
      nextStart: new Date("2026-01-02T03:30:00.000Z"),
    });
  });

  it("blocks a new dial before open and suggests today's start", () => {
    const result = evaluateNewDial(
      window,
      new Date("2026-01-01T02:00:00.000Z"), // 07:30 IST
    );

    expect(result).toMatchObject({
      allowed: false,
      nextStart: new Date("2026-01-01T03:30:00.000Z"),
    });
  });
});
