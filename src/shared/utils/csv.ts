export type CsvValue = string | number | boolean | null | undefined;

/**
 * Escapes a single cell value for CSV output in accordance with RFC 4180.
 * Wraps values containing quotes, commas, or newlines in double quotes,
 * and escapes internal double quotes by doubling them ("").
 */
export function escapeCsvCell(val: CsvValue): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serializes headers and a 2D array of rows into a valid CSV string.
 */
export function serializeCsv(headers: string[], rows: CsvValue[][]): string {
  const headerLine = headers.map(escapeCsvCell).join(",");
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(","));
  return [headerLine, ...dataLines].join("\n");
}

/**
 * Generates a date-stamped CSV filename: e.g. "leads_2026-10-10.csv".
 */
export function csvFilename(prefix: string): string {
  const date = new Date().toISOString().split("T")[0];
  return `${prefix}_${date}.csv`;
}
