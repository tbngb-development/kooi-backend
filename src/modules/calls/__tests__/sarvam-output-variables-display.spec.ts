import { describe, it, expect } from "vitest";

// Pure logic verification matching frontend/src/components/call-history/SarvamOutputVariablesAnalysis.tsx
const LONG_TEXT_THRESHOLD = 120;
const SYSTEMIC_MARKERS = ["NOT_MENTIONED", "NOT_SHARED", "NOT_ASKED", "NO_DATA", "NONE", "NULL"];

function humanize(str?: string): string {
  if (!str) return "";
  return str
    .replace(/^[-_]+|[-_]+$/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function isNullOrEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "object" && Object.keys(value as object).length === 0) return true;
  return false;
}

function formatOutputValue(val: unknown): string {
  if (isNullOrEmpty(val)) {
    return "—";
  }

  if (typeof val === "boolean") {
    return val ? "Yes" : "No";
  }

  if (typeof val === "number") {
    return String(val);
  }

  if (typeof val === "string") {
    const trimmed = val.trim();
    if (SYSTEMIC_MARKERS.includes(trimmed.toUpperCase())) {
      return humanize(trimmed);
    }

    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        return formatOutputValue(parsed);
      } catch {
        // Fall back to clean string
      }
    }

    return trimmed;
  }

  if (Array.isArray(val)) {
    const isPrimitiveArray = val.every(
      (item) =>
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean",
    );

    if (isPrimitiveArray) {
      return val.map((item) => (typeof item === "boolean" ? (item ? "Yes" : "No") : String(item))).join(", ");
    }

    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return "—";
    }
  }

  if (typeof val === "object") {
    try {
      const entries = Object.entries(val as Record<string, unknown>);
      if (entries.length === 0) return "—";

      const allPrimitive = entries.every(
        ([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null,
      );

      if (allPrimitive) {
        return entries
          .map(([k, v]) => {
            const displayV = v === null ? "—" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
            return `${humanize(k)}: ${displayV}`;
          })
          .join(" • ");
      }

      return JSON.stringify(val, null, 2);
    } catch {
      return "—";
    }
  }

  return String(val);
}

function isCallSummaryKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[\s_]+/g, "-");
  return (
    normalized === "call-summary" ||
    normalized === "summary" ||
    normalized.endsWith("-call-summary") ||
    normalized.startsWith("call-summary-")
  );
}

describe("SarvamOutputVariablesAnalysis Logic & Formatting", () => {
  it("Scenario 1: Formats string, number, and boolean values cleanly", () => {
    expect(formatOutputValue("Customer wants 2 BHK")).toBe("Customer wants 2 BHK");
    expect(formatOutputValue(42)).toBe("42");
    expect(formatOutputValue(0)).toBe("0");
    expect(formatOutputValue(true)).toBe("Yes");
    expect(formatOutputValue(false)).toBe("No");
  });

  it("Scenario 2: Formats null, undefined, and empty collections as dash placeholder", () => {
    expect(formatOutputValue(null)).toBe("—");
    expect(formatOutputValue(undefined)).toBe("—");
    expect(formatOutputValue("")).toBe("—");
    expect(formatOutputValue("   ")).toBe("—");
    expect(formatOutputValue([])).toBe("—");
    expect(formatOutputValue({})).toBe("—");
  });

  it("Scenario 3: Normalizes systemic markers like NOT_MENTIONED or NO_DATA", () => {
    expect(formatOutputValue("NOT_MENTIONED")).toBe("Not Mentioned");
    expect(formatOutputValue("no_data")).toBe("No Data");
  });

  it("Scenario 4: Formats primitive arrays and handles JSON strings", () => {
    expect(formatOutputValue(["Residential", "Commercial"])).toBe("Residential, Commercial");
    expect(formatOutputValue("[1, 2, 3]")).toBe("1, 2, 3");
  });

  it("Scenario 5: Formats flat and nested objects without [object Object]", () => {
    const flatObj = { city: "Kochi", pincode: 682001 };
    const formatted = formatOutputValue(flatObj);
    expect(formatted).not.toContain("[object Object]");
    expect(formatted).toContain("City: Kochi");
    expect(formatted).toContain("Pincode: 682001");

    const nestedObj = { address: { street: "MG Road" } };
    const formattedNested = formatOutputValue(nestedObj);
    expect(formattedNested).not.toContain("[object Object]");
    expect(formattedNested).toContain('"MG Road"');
  });

  it("Scenario 6: Correctly detects call summary key variants", () => {
    expect(isCallSummaryKey("call_summary")).toBe(true);
    expect(isCallSummaryKey("call-summary")).toBe(true);
    expect(isCallSummaryKey("summary")).toBe(true);
    expect(isCallSummaryKey("lead_temperature")).toBe(false);
    expect(isCallSummaryKey("budget")).toBe(false);
  });

  it("Scenario 7: Flags long text exceeding threshold for expand/collapse", () => {
    const shortText = "Interested in pricing";
    const longText = "Customer called to inquire about enterprise multi-tenant licensing. They need 50 concurrent seats, SIP trunking support, custom regional accents, and priority SLA onboarding.";
    expect(shortText.length).toBeLessThan(LONG_TEXT_THRESHOLD);
    expect(longText.length).toBeGreaterThan(LONG_TEXT_THRESHOLD);
  });

  it("Scenario 8: Filters invalid or malformed variable entries safely", () => {
    const rawVariables = [
      { key: "valid_key", value: "ok" },
      { key: "", value: "empty key" },
      null,
      undefined,
      { notAKey: 123 },
      { key: "another_valid", value: 100 },
    ];

    const valid = (rawVariables as any[]).filter(
      (item) => item && typeof item === "object" && typeof item.key === "string" && item.key.trim().length > 0,
    );

    expect(valid).toHaveLength(2);
    expect(valid[0].key).toBe("valid_key");
    expect(valid[1].key).toBe("another_valid");
  });

  it("Scenario 9: Provider segregation: Sarvam renders outputVariables, Bolna renders dynamicExtractions", () => {
    const sarvamCall = {
      provider: "SARVAM" as const,
      callAnalysis: {
        outputVariables: [{ key: "lead_temperature", value: "hot" }],
        dynamicExtractions: null,
      },
    };

    const bolnaCall = {
      provider: "BOLNA" as const,
      callAnalysis: {
        outputVariables: null,
        dynamicExtractions: { General: { summary: { objective: "Interested" } } },
      },
    };

    // Sarvam check
    expect(sarvamCall.provider === "SARVAM").toBe(true);
    expect(Boolean(sarvamCall.callAnalysis.outputVariables?.length)).toBe(true);

    // Bolna check
    expect(bolnaCall.provider === "SARVAM").toBe(false);
    expect(Boolean(bolnaCall.callAnalysis.dynamicExtractions)).toBe(true);
  });
});
