import { describe, it, expect } from "vitest";
import {
  parseBolnaTimestamp,
  resolveAttemptStartTime,
  resolveAttemptEndTime,
} from "../call-timestamp.rules";

describe("call-timestamp.rules", () => {
  describe("parseBolnaTimestamp", () => {
    it("should return null for empty/invalid strings", () => {
      expect(parseBolnaTimestamp(null)).toBeNull();
      expect(parseBolnaTimestamp(undefined)).toBeNull();
      expect(parseBolnaTimestamp("")).toBeNull();
      expect(parseBolnaTimestamp("not-a-date")).toBeNull();
    });

    it("should parse standard ISO strings with timezone offset", () => {
      const parsed = parseBolnaTimestamp("2026-09-04T08:52:07.408883+00:00");
      expect(parsed).not.toBeNull();
      expect(parsed?.toISOString()).toBe("2026-09-04T08:52:07.408Z");
    });

    it("should parse Bolna timestamp without timezone offset as UTC", () => {
      const parsed = parseBolnaTimestamp("2026-09-04T08:52:09.737874");
      expect(parsed).not.toBeNull();
      expect(parsed?.toISOString()).toBe("2026-09-04T08:52:09.737Z");
    });
  });

  describe("resolveAttemptStartTime", () => {
    it("should preserve existing startedAt if continuing the same in-flight attempt", () => {
      const existingStartedAt = new Date("2026-10-30T10:00:00.000Z");
      const resolved = resolveAttemptStartTime(
        {
          status: "in-progress",
          initiated_at: "2026-10-30T10:00:05.000Z",
        },
        existingStartedAt,
        false, // not a new attempt
      );

      expect(resolved.toISOString()).toBe(existingStartedAt.toISOString());
    });

    it("should update startedAt from initiated_at if a new attempt is starting", () => {
      const existingStartedAt = new Date("2026-10-30T10:00:00.000Z");
      const resolved = resolveAttemptStartTime(
        {
          status: "in-progress",
          initiated_at: "2026-10-30T10:15:00.000Z",
        },
        existingStartedAt,
        true, // new retry attempt
      );

      expect(resolved.toISOString()).toBe("2026-10-30T10:15:00.000Z");
    });

    it("should prioritize telephony_data.start_time if initiated_at is absent", () => {
      const resolved = resolveAttemptStartTime(
        {
          status: "ringing",
          telephony_data: {
            duration: 0,
            recording_url: "",
            to_number: "",
            from_number: "",
            start_time: "2026-10-30T10:15:02.000Z",
          },
          created_at: "2026-10-30T10:15:00.000Z",
        },
        null,
        true,
      );

      expect(resolved.toISOString()).toBe("2026-10-30T10:15:02.000Z");
    });

    it("should fall back to created_at or at if earlier fields are absent", () => {
      const resolved = resolveAttemptStartTime(
        {
          status: "in-progress",
          created_at: "2026-10-30T10:20:00.000Z",
        },
        null,
        true,
      );

      expect(resolved.toISOString()).toBe("2026-10-30T10:20:00.000Z");
    });
  });

  describe("resolveAttemptEndTime", () => {
    it("should prioritize updated_at as completion time", () => {
      const resolved = resolveAttemptEndTime({
        status: "completed",
        updated_at: "2026-10-30T10:05:30.000Z",
        created_at: "2026-10-30T10:00:00.000Z",
      });

      expect(resolved.toISOString()).toBe("2026-10-30T10:05:30.000Z");
    });

    it("should fall back to telephony_data.end_time or created_at if updated_at is absent", () => {
      const resolved = resolveAttemptEndTime({
        status: "no-answer",
        telephony_data: {
          duration: 10,
          recording_url: "",
          to_number: "",
          from_number: "",
          end_time: "2026-10-30T10:00:45.000Z",
        },
      });

      expect(resolved.toISOString()).toBe("2026-10-30T10:00:45.000Z");
    });
  });
});

