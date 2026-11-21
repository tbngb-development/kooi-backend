import { describe, it, expect } from "vitest";
import {
  dedupeLatestCallPerPhone,
  formatExportDateTime,
  humanizeCallStatus,
  serializeCallsToCsv,
  type CallExportEntry,
} from "../application/utils/call-export-csv";
import {
  ExportCallsUseCase,
  MAX_EXPORT_ROWS,
} from "../application/use-cases/export-calls.use-case";
import type { CallRepository } from "../application/interfaces/call-repository.interface";

type ExportCall = CallExportEntry & { id: string };

function call(
  overrides: Partial<ExportCall> & { id: string },
): ExportCall {
  return {
    status: "COMPLETED",
    startedAt: "2026-11-21T05:30:00.000Z",
    createdAt: "2026-11-21T05:30:00.000Z",
    lead: { id: "lead", name: "Riya", phone: "+919876543210" },
    ...overrides,
  } as ExportCall;
}

describe("call export CSV helpers", () => {
  it("keeps only the latest call per phone and orders by date descending", () => {
    const result = dedupeLatestCallPerPhone([
      call({
        id: "old",
        startedAt: "2026-11-20T05:30:00.000Z",
        lead: { id: "l1", name: "Riya", phone: " +91 98765-43210 " },
      }),
      call({
        id: "new",
        startedAt: "2026-11-21T09:15:00.000Z",
        lead: { id: "l1", name: "Riya", phone: "+919876543210" },
      }),
      call({
        id: "other",
        startedAt: "2026-11-21T06:00:00.000Z",
        lead: { id: "l2", name: "Arjun", phone: "+919999999999" },
      }),
    ]);

    expect(result.map((c) => c.id)).toEqual(["new", "other"]);
  });

  it("keeps calls without a lead instead of collapsing them together", () => {
    const result = dedupeLatestCallPerPhone([
      call({ id: "no-lead-a", lead: null }),
      call({ id: "no-lead-b", lead: null }),
    ]);

    expect(result).toHaveLength(2);
  });

  it("humanizes call statuses", () => {
    expect(humanizeCallStatus("NO_ANSWER")).toBe("No Answer");
    expect(humanizeCallStatus("COMPLETED")).toBe("Completed");
    expect(humanizeCallStatus("")).toBe("");
  });

  it("formats date-time in the requested timezone", () => {
    const instant = "2026-11-21T05:30:00.000Z";

    expect(formatExportDateTime(instant, "Asia/Kolkata")).toBe(
      "2026-11-21 11:00:00",
    );
    expect(formatExportDateTime(instant, "UTC")).toBe("2026-11-21 05:30:00");
    expect(formatExportDateTime(null, "UTC")).toBe("");
  });

  it("serializes four quoted columns with a BOM and neutralizes only name formulas", () => {
    const csv = serializeCallsToCsv(
      [
        call({
          id: "formula",
          lead: {
            id: "l1",
            name: '=HYPERLINK("x")',
            phone: "+919876543210",
          },
          status: "NO_ANSWER",
          startedAt: "2026-11-21T05:30:00.000Z",
        }),
        call({
          id: "no-name",
          lead: { id: "l2", name: null, phone: "+919999999999" },
        }),
      ],
      "UTC",
    );

    expect(csv).toBe(
      "\uFEFF\"Name\",\"Phone\",\"Status\",\"Date & Time\"\r\n" +
        "\"'=HYPERLINK(\"\"x\"\")\",\"+919876543210\",\"No Answer\",\"2026-11-21 05:30:00\"\r\n" +
        "\"\",\"+919999999999\",\"Completed\",\"2026-11-21 05:30:00\"",
    );
  });
});

describe("ExportCallsUseCase", () => {
  it("passes every filter through, dedupes contacts, and returns CSV", async () => {
    const findAllForExport = async () => [
      call({
        id: "old",
        startedAt: "2026-11-20T05:30:00.000Z",
        lead: { id: "l1", name: "Riya", phone: "+919876543210" },
      }),
      call({
        id: "new",
        startedAt: "2026-11-21T05:30:00.000Z",
        lead: { id: "l1", name: "Riya", phone: "+919876543210" },
      }),
    ];
    const repo = { findAllForExport } as unknown as CallRepository;
    const useCase = new ExportCallsUseCase(repo);

    const csv = await useCase.execute({
      tenantId: "tenant-1",
      campaignId: "campaign-1",
      status: "COMPLETED",
      search: "Riya",
      dateFrom: "2026-11-01T00:00:00.000Z",
      dynamicFilters: { interest: "yes" },
      goalId: "goal-1",
      timezone: "Asia/Kolkata",
    });

    const rows = csv.split("\r\n");
    expect(rows).toHaveLength(2);
    expect(csv).toContain("2026-11-21 11:00:00");
  });

  it("rejects exports larger than the row cap", async () => {
    const repo = {
      findAllForExport: async () =>
        Array.from({ length: MAX_EXPORT_ROWS + 1 }, (_, index) =>
          call({ id: `call-${index}` }),
        ),
    } as unknown as CallRepository;
    const useCase = new ExportCallsUseCase(repo);

    await expect(
      useCase.execute({ tenantId: "tenant-1", timezone: "UTC" }),
    ).rejects.toThrow(/narrow your filters/i);
  });
});
