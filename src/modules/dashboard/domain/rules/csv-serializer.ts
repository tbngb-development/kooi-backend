type CsvValue = string | number | boolean | null | undefined;

function escapeCell(val: CsvValue): string {
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

export function serializeCsv(headers: string[], rows: CsvValue[][]): string {
  const headerLine = headers.map(escapeCell).join(",");
  const dataLines = rows.map((row) => row.map(escapeCell).join(","));
  return [headerLine, ...dataLines].join("\n");
}

export function csvFilename(prefix: string): string {
  const date = new Date().toISOString().split("T")[0];
  return `${prefix}_${date}.csv`;
}
