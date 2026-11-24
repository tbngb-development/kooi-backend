import { describe, expect, it } from "vitest";
import { transformToBolnaCSV } from "../infrastructure/csv-transformer";

describe("transformToBolnaCSV", () => {
  it("drops non-importable phone numbers even when they have a +91 prefix", () => {
    const result = transformToBolnaCSV(
      [{ name: "Test User", phone: "+911234567890" }],
      {},
    );

    expect(result.validCount).toBe(0);
    expect(result.filteredOutCount).toBe(1);
    expect(result.transformedBuffer.toString("utf-8")).not.toContain(
      "+911234567890",
    );
  });
});
