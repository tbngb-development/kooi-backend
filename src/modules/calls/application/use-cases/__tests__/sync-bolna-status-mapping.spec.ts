import { describe, expect, it } from "vitest";
import {
  isBillableSyncCall,
  mapBolnaStatusToCallStatus,
} from "../sync-bolna-execution.use-case";

describe("Bolna execution status → call status mapping (billing safety)", () => {
  it.each(["completed", "ended", "call-completed", "call_completed"])(
    "maps billable provider status %s to COMPLETED",
    (status) => {
      expect(mapBolnaStatusToCallStatus(status)).toBe("COMPLETED");
    },
  );

  it.each(["scheduled", "rescheduled"])(
    "maps retry status %s to SCHEDULED",
    (status) => {
      expect(mapBolnaStatusToCallStatus(status)).toBe("SCHEDULED");
    },
  );

  it.each([
    "call-disconnected",
    "call_disconnected",
    "disconnected",
    "call-dropped",
    "dropped",
  ])("maps disconnected status %s to FAILED, never COMPLETED", (status) => {
    const mapped = mapBolnaStatusToCallStatus(status);
    expect(mapped).toBe("FAILED");
    expect(mapped).not.toBe("COMPLETED");
  });

  it.each(["failed", "error", "no-answer", "busy", "stopped", "scheduled"])(
    "maps non-completed status %s to a non-COMPLETED status",
    (status) => {
      expect(mapBolnaStatusToCallStatus(status)).not.toBe("COMPLETED");
    },
  );

  it.each(["", "something-new", "mystery_state", undefined, null])(
    "fails closed for unknown status %s → FAILED",
    (status) => {
      expect(mapBolnaStatusToCallStatus(status)).toBe("FAILED");
    },
  );
});

describe("Bolna sync billing eligibility", () => {
  it("bills an explicitly COMPLETED call with positive duration", () => {
    expect(isBillableSyncCall("COMPLETED", 45)).toBe(true);
  });

  it("never bills a disconnected/failed/unknown status even with duration", () => {
    for (const status of ["FAILED", "NO_ANSWER", "BUSY", "STOPPED"] as const) {
      expect(isBillableSyncCall(status, 120)).toBe(false);
    }
  });

  it("never bills a completed call with zero or negative duration", () => {
    expect(isBillableSyncCall("COMPLETED", 0)).toBe(false);
    expect(isBillableSyncCall("COMPLETED", -1)).toBe(false);
  });
});
