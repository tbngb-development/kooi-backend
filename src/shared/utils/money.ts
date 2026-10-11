/**
 * Monetary utilities for backend money calculations.
 * All internal monetary values are stored in integer paisa (1 ₹ = 100 paisa).
 */

/** Convert integer paisa → rupees (float) */
export function paisaToRupees(paisa: number): number {
  return (paisa ?? 0) / 100;
}

/** Convert rupees (float) → integer paisa */
export function rupeesToPaisa(rupees: number): number {
  return Math.round((rupees ?? 0) * 100);
}

/** Formats integer paisa to rupees fixed string: e.g. 50000 → "500.00" */
export function paisaToRupeesFixed(
  paisa: number,
  fractionDigits: number = 2,
): string {
  return paisaToRupees(paisa).toFixed(fractionDigits);
}

/** Format integer paisa as display string: "₹19,999.00" */
export function formatPaisa(paisa: number): string {
  return `₹${paisaToRupees(paisa).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Canonical alias matching email and invoice templates */
export const paisaToInr = formatPaisa;
