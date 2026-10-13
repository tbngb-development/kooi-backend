import { describe, it, expect } from "vitest";
import {
  evaluateCallRetry,
  mapLastRetryToLeadStatus,
} from "../../../src/modules/webhooks/domain/rules/call-retry.rules";
import type { RetryConfig } from "../../../src/shared/types/bolna.types";

describe("Call Retry Rules", () => {
  describe("evaluateCallRetry", () => {
    const defaultRetryConfig: RetryConfig = {
      enabled: true,
      max_retries: 3,
      retry_on_statuses: ["no-answer", "busy", "failed"],
      retry_intervals_minutes: [15],
    };

    it("does not retry if the parent batch was manually stopped", () => {
      const result = evaluateCallRetry({
        isBatchStopped: true,
        retryConfig: defaultRetryConfig,
        currentAttempts: 0,
        status: "NO_ANSWER",
      });

      expect(result.willRetry).toBe(false);
      expect(result.finalCallStatus).toBe("NO_ANSWER");
      expect(result.leadStatus).toBe("NO_ANSWER");
    });

    it("does not retry if retryConfig is disabled", () => {
      const result = evaluateCallRetry({
        isBatchStopped: false,
        retryConfig: { ...defaultRetryConfig, enabled: false },
        currentAttempts: 0,
        status: "BUSY",
      });

      expect(result.willRetry).toBe(false);
      expect(result.finalCallStatus).toBe("BUSY");
      expect(result.leadStatus).toBe("CALLED"); // Without retry enabled, marked as CALLED
    });

    it("does not retry if retryConfig is null/undefined", () => {
      const result = evaluateCallRetry({
        isBatchStopped: false,
        retryConfig: null,
        currentAttempts: 0,
        status: "FAILED",
      });

      expect(result.willRetry).toBe(false);
      expect(result.finalCallStatus).toBe("FAILED");
      expect(result.leadStatus).toBe("CALLED");
    });

    it("schedules retry when attempts < max_retries for NO_ANSWER", () => {
      const result = evaluateCallRetry({
        isBatchStopped: false,
        retryConfig: defaultRetryConfig,
        currentAttempts: 1,
        status: "NO_ANSWER",
      });

      expect(result.willRetry).toBe(true);
      expect(result.finalCallStatus).toBe("SCHEDULED");
      expect(result.leadStatus).toBe("NO_ANSWER");
    });

    it("schedules retry when attempts < max_retries for BUSY", () => {
      const result = evaluateCallRetry({
        isBatchStopped: false,
        retryConfig: defaultRetryConfig,
        currentAttempts: 2,
        status: "BUSY",
      });

      expect(result.willRetry).toBe(true);
      expect(result.finalCallStatus).toBe("SCHEDULED");
      expect(result.leadStatus).toBe("BUSY");
    });

    it("schedules retry when attempts < max_retries for FAILED", () => {
      const result = evaluateCallRetry({
        isBatchStopped: false,
        retryConfig: defaultRetryConfig,
        currentAttempts: 0,
        status: "FAILED",
      });

      expect(result.willRetry).toBe(true);
      expect(result.finalCallStatus).toBe("SCHEDULED");
      expect(result.leadStatus).toBe("FAILED");
    });

    it("stops retrying once max_retries limit is reached or exceeded", () => {
      const result = evaluateCallRetry({
        isBatchStopped: false,
        retryConfig: defaultRetryConfig,
        currentAttempts: 3, // equal to max_retries
        status: "NO_ANSWER",
      });

      expect(result.willRetry).toBe(false);
      expect(result.finalCallStatus).toBe("NO_ANSWER");
      expect(result.leadStatus).toBe("NO_ANSWER");
    });

    it("does not retry if the status is excluded from retry_on_statuses", () => {
      const selectiveConfig: RetryConfig = {
        enabled: true,
        max_retries: 3,
        retry_on_statuses: ["busy"], // only busy
      };

      const result = evaluateCallRetry({
        isBatchStopped: false,
        retryConfig: selectiveConfig,
        currentAttempts: 0,
        status: "NO_ANSWER",
      });

      expect(result.willRetry).toBe(false);
      expect(result.finalCallStatus).toBe("NO_ANSWER");
      expect(result.leadStatus).toBe("NO_ANSWER");
    });
  });

  describe("mapLastRetryToLeadStatus", () => {
    it("maps null or undefined raw status to FAILED", () => {
      expect(mapLastRetryToLeadStatus(null)).toBe("FAILED");
      expect(mapLastRetryToLeadStatus(undefined)).toBe("FAILED");
      expect(mapLastRetryToLeadStatus("")).toBe("FAILED");
    });

    it("maps busy variations to BUSY", () => {
      expect(mapLastRetryToLeadStatus("busy")).toBe("BUSY");
      expect(mapLastRetryToLeadStatus("BUSY")).toBe("BUSY");
      expect(mapLastRetryToLeadStatus("Busy")).toBe("BUSY");
    });

    it("maps no-answer variations to NO_ANSWER", () => {
      expect(mapLastRetryToLeadStatus("no-answer")).toBe("NO_ANSWER");
      expect(mapLastRetryToLeadStatus("no_answer")).toBe("NO_ANSWER");
      expect(mapLastRetryToLeadStatus("NO-ANSWER")).toBe("NO_ANSWER");
      expect(mapLastRetryToLeadStatus("NO_ANSWER")).toBe("NO_ANSWER");
    });

    it("maps other failure states or unknown strings to FAILED", () => {
      expect(mapLastRetryToLeadStatus("failed")).toBe("FAILED");
      expect(mapLastRetryToLeadStatus("error")).toBe("FAILED");
      expect(mapLastRetryToLeadStatus("unknown_event")).toBe("FAILED");
    });
  });
});
