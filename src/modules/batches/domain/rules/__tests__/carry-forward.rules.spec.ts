import { describe, expect, it } from "vitest";
import { selectCarryForwardLeads } from "../carry-forward.rules";

const windowEnd = new Date("2026-01-01T21:00:00.000Z");

const lead = (
  overrides: Partial<{
    id: string;
    status: string;
    calls: Array<{ status: string; createdAt: Date }>;
  }> = {},
) => ({
  id: overrides.id ?? "lead-1",
  name: "Lead",
  phone: "+919876543210",
  email: null,
  company: null,
  metadata: null,
  status: overrides.status ?? "PENDING",
  calls: overrides.calls ?? [],
});

describe("selectCarryForwardLeads", () => {
  it("carries forward un-dialed and stopped leads", () => {
    const result = selectCarryForwardLeads(
      [lead({ id: "pending", status: "PENDING" }), lead({ id: "stopped", status: "STOPPED" })],
      windowEnd,
    );

    expect(result.map((item) => item.id)).toEqual(["pending", "stopped"]);
  });

  it("leaves in-flight calls untouched", () => {
    const result = selectCarryForwardLeads(
      [lead({ status: "CALLING" })],
      windowEnd,
    );

    expect(result).toEqual([]);
  });

  it("excludes terminal results without a pending retry", () => {
    const result = selectCarryForwardLeads(
      [
        lead({ id: "called", status: "CALLED" }),
        lead({ id: "no-answer", status: "NO_ANSWER" }),
        lead({ id: "busy", status: "BUSY" }),
        lead({ id: "failed", status: "FAILED" }),
      ],
      windowEnd,
    );

    expect(result).toEqual([]);
  });

  it("carries forward retries scheduled inside the window", () => {
    const result = selectCarryForwardLeads(
      [
        lead({
          id: "retry",
          status: "NO_ANSWER",
          calls: [
            {
              status: "SCHEDULED",
              createdAt: new Date("2026-01-01T20:58:00.000Z"),
            },
          ],
        }),
      ],
      windowEnd,
    );

    expect(result.map((item) => item.id)).toEqual(["retry"]);
  });

  it("excludes retries scheduled after the window closed", () => {
    const result = selectCarryForwardLeads(
      [
        lead({
          status: "BUSY",
          calls: [
            {
              status: "SCHEDULED",
              createdAt: new Date("2026-01-01T21:05:00.000Z"),
            },
          ],
        }),
      ],
      windowEnd,
    );

    expect(result).toEqual([]);
  });
});
