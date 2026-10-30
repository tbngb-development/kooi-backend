import { describe, it, expect } from "vitest";
import {
  canTransitionCallStatus,
  isTerminalCallStatus,
} from "../call-state-machine.rules";

describe("call-state-machine.rules", () => {
  describe("isTerminalCallStatus", () => {
    it("should identify COMPLETED, FAILED, STOPPED, NO_ANSWER, BUSY as terminal", () => {
      expect(isTerminalCallStatus("COMPLETED")).toBe(true);
      expect(isTerminalCallStatus("FAILED")).toBe(true);
      expect(isTerminalCallStatus("STOPPED")).toBe(true);
      expect(isTerminalCallStatus("NO_ANSWER")).toBe(true);
      expect(isTerminalCallStatus("BUSY")).toBe(true);

      expect(isTerminalCallStatus("PENDING")).toBe(false);
      expect(isTerminalCallStatus("CALLING")).toBe(false);
      expect(isTerminalCallStatus("SCHEDULED")).toBe(false);
    });
  });

  describe("canTransitionCallStatus", () => {
    it("should allow identity transitions", () => {
      expect(canTransitionCallStatus("SCHEDULED", "SCHEDULED")).toBe(true);
      expect(canTransitionCallStatus("COMPLETED", "COMPLETED")).toBe(true);
      expect(canTransitionCallStatus("NO_ANSWER", "NO_ANSWER")).toBe(true);
    });

    it("should prevent COMPLETED or STOPPED from transitioning to active states", () => {
      expect(canTransitionCallStatus("COMPLETED", "CALLING")).toBe(false);
      expect(canTransitionCallStatus("COMPLETED", "SCHEDULED")).toBe(false);
      expect(canTransitionCallStatus("COMPLETED", "SCHEDULED", { isRetryScheduled: true })).toBe(false);
      expect(canTransitionCallStatus("STOPPED", "CALLING")).toBe(false);
      expect(canTransitionCallStatus("STOPPED", "SCHEDULED")).toBe(false);
      expect(canTransitionCallStatus("STOPPED", "SCHEDULED", { isRetryScheduled: true })).toBe(false);
    });

    it("should allow NO_ANSWER, BUSY, FAILED -> SCHEDULED when isRetryScheduled is true", () => {
      expect(
        canTransitionCallStatus("NO_ANSWER", "SCHEDULED", { isRetryScheduled: true }),
      ).toBe(true);
      expect(
        canTransitionCallStatus("BUSY", "SCHEDULED", { isRetryScheduled: true }),
      ).toBe(true);
      expect(
        canTransitionCallStatus("FAILED", "SCHEDULED", { isRetryScheduled: true }),
      ).toBe(true);
    });

    it("should reject NO_ANSWER, BUSY, FAILED -> SCHEDULED when isRetryScheduled is false or undefined", () => {
      expect(canTransitionCallStatus("NO_ANSWER", "SCHEDULED")).toBe(false);
      expect(canTransitionCallStatus("NO_ANSWER", "SCHEDULED", { isRetryScheduled: false })).toBe(false);
      expect(canTransitionCallStatus("BUSY", "SCHEDULED")).toBe(false);
      expect(canTransitionCallStatus("FAILED", "SCHEDULED")).toBe(false);
    });

    it("should reject NO_ANSWER, BUSY, FAILED -> CALLING or PENDING without retry scheduling", () => {
      expect(canTransitionCallStatus("NO_ANSWER", "CALLING")).toBe(false);
      expect(canTransitionCallStatus("BUSY", "CALLING")).toBe(false);
      expect(canTransitionCallStatus("FAILED", "CALLING")).toBe(false);
      expect(canTransitionCallStatus("NO_ANSWER", "PENDING")).toBe(false);
    });

    it("should allow SCHEDULED -> CALLING when retry attempt starts", () => {
      expect(canTransitionCallStatus("SCHEDULED", "CALLING")).toBe(true);
    });

    it("should allow PENDING -> SCHEDULED and PENDING -> CALLING", () => {
      expect(canTransitionCallStatus("PENDING", "SCHEDULED")).toBe(true);
      expect(canTransitionCallStatus("PENDING", "CALLING")).toBe(true);
    });

    it("should allow CALLING -> terminal states", () => {
      expect(canTransitionCallStatus("CALLING", "COMPLETED")).toBe(true);
      expect(canTransitionCallStatus("CALLING", "NO_ANSWER")).toBe(true);
      expect(canTransitionCallStatus("CALLING", "BUSY")).toBe(true);
      expect(canTransitionCallStatus("CALLING", "FAILED")).toBe(true);
      expect(canTransitionCallStatus("CALLING", "STOPPED")).toBe(true);
    });
  });
});

