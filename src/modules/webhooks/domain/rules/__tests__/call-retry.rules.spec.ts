import { describe, it, expect } from "vitest";
import {
  isRetryPermitted,
  mapLastRetryToLeadStatus,
  mapRetryStatusToCallStatus,
} from "../call-retry.rules";

describe("call-retry.rules", () => {
  describe("isRetryPermitted", () => {
    const validConfig = {
      enabled: true,
      max_retries: 2,
      retry_on_statuses: ["no-answer", "busy", "failed"] as Array<"no-answer" | "busy" | "failed">,
    };

    it("should allow retry when attemptsExecuted < (1 + max_retries) and status matches", () => {
      // After attempt 1 (attemptsExecuted = 1 < 3)
      expect(
        isRetryPermitted({
          isBatchStopped: false,
          retryConfig: validConfig,
          attemptsExecuted: 1,
          lastAttemptStatus: "no-answer",
        }),
      ).toBe(true);

      // After attempt 2 (attemptsExecuted = 2 < 3)
      expect(
        isRetryPermitted({
          isBatchStopped: false,
          retryConfig: validConfig,
          attemptsExecuted: 2,
          lastAttemptStatus: "busy",
        }),
      ).toBe(true);
    });

    it("should reject retry when attemptsExecuted >= (1 + max_retries) (retries exhausted)", () => {
      // 1 initial + 2 retries = 3 total attempts
      expect(
        isRetryPermitted({
          isBatchStopped: false,
          retryConfig: validConfig,
          attemptsExecuted: 3,
          lastAttemptStatus: "no-answer",
        }),
      ).toBe(false);

      expect(
        isRetryPermitted({
          isBatchStopped: false,
          retryConfig: validConfig,
          attemptsExecuted: 4,
          lastAttemptStatus: "no-answer",
        }),
      ).toBe(false);
    });

    it("should reject retry when batch is stopped", () => {
      expect(
        isRetryPermitted({
          isBatchStopped: true,
          retryConfig: validConfig,
          attemptsExecuted: 1,
          lastAttemptStatus: "no-answer",
        }),
      ).toBe(false);
    });

    it("should reject retry when retries are disabled or max_retries <= 0", () => {
      expect(
        isRetryPermitted({
          isBatchStopped: false,
          retryConfig: { ...validConfig, enabled: false },
          attemptsExecuted: 1,
          lastAttemptStatus: "no-answer",
        }),
      ).toBe(false);

      expect(
        isRetryPermitted({
          isBatchStopped: false,
          retryConfig: { ...validConfig, max_retries: 0 },
          attemptsExecuted: 0,
          lastAttemptStatus: "no-answer",
        }),
      ).toBe(false);

      expect(
        isRetryPermitted({
          isBatchStopped: false,
          retryConfig: null,
          attemptsExecuted: 1,
          lastAttemptStatus: "no-answer",
        }),
      ).toBe(false);
    });

    it("should reject retry when status is not in retry_on_statuses", () => {
      const configOnlyBusy = {
        enabled: true,
        max_retries: 2,
        retry_on_statuses: ["busy"] as Array<"no-answer" | "busy" | "failed">,
      };

      expect(
        isRetryPermitted({
          isBatchStopped: false,
          retryConfig: configOnlyBusy,
          attemptsExecuted: 1,
          lastAttemptStatus: "no-answer",
        }),
      ).toBe(false);

      expect(
        isRetryPermitted({
          isBatchStopped: false,
          retryConfig: configOnlyBusy,
          attemptsExecuted: 1,
          lastAttemptStatus: "busy",
        }),
      ).toBe(true);
    });
  });

  describe("mapLastRetryToLeadStatus", () => {
    it("should map busy, no-answer, failed appropriately", () => {
      expect(mapLastRetryToLeadStatus("busy")).toBe("BUSY");
      expect(mapLastRetryToLeadStatus("BUSY")).toBe("BUSY");
      expect(mapLastRetryToLeadStatus("no-answer")).toBe("NO_ANSWER");
      expect(mapLastRetryToLeadStatus("no_answer")).toBe("NO_ANSWER");
      expect(mapLastRetryToLeadStatus("failed")).toBe("FAILED");
      expect(mapLastRetryToLeadStatus(null)).toBe("FAILED");
    });
  });

  describe("mapRetryStatusToCallStatus", () => {
    it("should map raw statuses correctly", () => {
      expect(mapRetryStatusToCallStatus("busy")).toBe("BUSY");
      expect(mapRetryStatusToCallStatus("no-answer")).toBe("NO_ANSWER");
      expect(mapRetryStatusToCallStatus("completed")).toBe("COMPLETED");
      expect(mapRetryStatusToCallStatus("failed")).toBe("FAILED");
      expect(mapRetryStatusToCallStatus(null)).toBe("FAILED");
    });
  });
});
