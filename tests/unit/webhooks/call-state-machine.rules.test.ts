import { describe, it, expect } from "vitest";
import {
  isTerminalCallStatus,
  canTransitionCallStatus,
} from "../../../src/modules/webhooks/domain/rules/call-state-machine.rules";
import type { CallStatus } from "@prisma/client";

describe("Call State Machine Rules", () => {
  describe("isTerminalCallStatus", () => {
    it("identifies terminal call statuses correctly", () => {
      const terminalStatuses: CallStatus[] = [
        "COMPLETED",
        "FAILED",
        "STOPPED",
        "NO_ANSWER",
        "BUSY",
      ];

      for (const status of terminalStatuses) {
        expect(isTerminalCallStatus(status)).toBe(true);
      }
    });

    it("identifies non-terminal (in-flight/pending) call statuses correctly", () => {
      const activeStatuses: CallStatus[] = ["PENDING", "CALLING", "SCHEDULED"];

      for (const status of activeStatuses) {
        expect(isTerminalCallStatus(status)).toBe(false);
      }
    });
  });

  describe("canTransitionCallStatus", () => {
    it("allows identical status transitions (idempotent)", () => {
      expect(canTransitionCallStatus("COMPLETED", "COMPLETED")).toBe(true);
      expect(canTransitionCallStatus("CALLING", "CALLING")).toBe(true);
      expect(canTransitionCallStatus("STOPPED", "STOPPED")).toBe(true);
      expect(canTransitionCallStatus("PENDING", "PENDING")).toBe(true);
      expect(canTransitionCallStatus("NO_ANSWER", "NO_ANSWER")).toBe(true);
    });

    it("allows standard progressive call lifecycle transitions", () => {
      expect(canTransitionCallStatus("PENDING", "CALLING")).toBe(true);
      expect(canTransitionCallStatus("CALLING", "COMPLETED")).toBe(true);
      expect(canTransitionCallStatus("CALLING", "NO_ANSWER")).toBe(true);
      expect(canTransitionCallStatus("CALLING", "BUSY")).toBe(true);
      expect(canTransitionCallStatus("CALLING", "FAILED")).toBe(true);
      expect(canTransitionCallStatus("CALLING", "STOPPED")).toBe(true);
      expect(canTransitionCallStatus("SCHEDULED", "CALLING")).toBe(true);
    });

    it("strictly blocks terminal COMPLETED calls from regressing backwards", () => {
      expect(canTransitionCallStatus("COMPLETED", "CALLING")).toBe(false);
      expect(canTransitionCallStatus("COMPLETED", "SCHEDULED")).toBe(false);
      expect(canTransitionCallStatus("COMPLETED", "PENDING")).toBe(false);
      expect(canTransitionCallStatus("COMPLETED", "BUSY")).toBe(false);
      expect(canTransitionCallStatus("COMPLETED", "NO_ANSWER")).toBe(false);
      expect(canTransitionCallStatus("COMPLETED", "FAILED")).toBe(false);
    });

    it("strictly blocks terminal STOPPED calls from regressing backwards", () => {
      expect(canTransitionCallStatus("STOPPED", "CALLING")).toBe(false);
      expect(canTransitionCallStatus("STOPPED", "SCHEDULED")).toBe(false);
      expect(canTransitionCallStatus("STOPPED", "PENDING")).toBe(false);
      expect(canTransitionCallStatus("STOPPED", "COMPLETED")).toBe(false);
    });

    it("prevents late in-flight events (CALLING, PENDING) on NO_ANSWER, BUSY, or FAILED calls", () => {
      expect(canTransitionCallStatus("NO_ANSWER", "CALLING")).toBe(false);
      expect(canTransitionCallStatus("NO_ANSWER", "PENDING")).toBe(false);

      expect(canTransitionCallStatus("BUSY", "CALLING")).toBe(false);
      expect(canTransitionCallStatus("BUSY", "PENDING")).toBe(false);

      expect(canTransitionCallStatus("FAILED", "CALLING")).toBe(false);
      expect(canTransitionCallStatus("FAILED", "PENDING")).toBe(false);
    });

    it("permits NO_ANSWER, BUSY, or FAILED calls to transition to SCHEDULED when retried", () => {
      expect(canTransitionCallStatus("NO_ANSWER", "SCHEDULED")).toBe(true);
      expect(canTransitionCallStatus("BUSY", "SCHEDULED")).toBe(true);
      expect(canTransitionCallStatus("FAILED", "SCHEDULED")).toBe(true);
    });
  });
});
