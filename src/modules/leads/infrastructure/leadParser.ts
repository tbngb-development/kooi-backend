import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { MissingRequiredHeaderError } from "../domain/errors/lead.errors";

// ── Types ────────────────────────────────────────────────────────────────────

export interface LeadRow {
  name: string | null;
  phone: string;
  email?: string;
  company?: string;
  [key: string]: string | null | undefined;
}

export type SupportedFileType = "csv" | "xlsx" | "xls";

export interface HeaderValidationResult {
  hasContactNumber: boolean;
  hasCustomerName: boolean;
  rawHeaders: string[];
}

export { MissingRequiredHeaderError };

// ── Header Validator ─────────────────────────────────────────────────────────

export function validateLeadHeaders(
  rawHeaders: string[],
): HeaderValidationResult {
  const normalized = rawHeaders.map((h) => h.trim().toLowerCase());
  return {
    hasContactNumber: normalized.includes("contact_number"),
    hasCustomerName: normalized.includes("customer_name"),
    rawHeaders,
  };
}

// ── Phone Sanitizer ──────────────────────────────────────────────────────────

const sanitizePhone = (raw: string): string => {
  if (!raw) return "";
  const cleaned = raw.trim();
  if (cleaned.startsWith("+")) {
    return "+" + cleaned.slice(1).replace(/\D/g, "");
  }
  return cleaned.replace(/\D/g, "");
};

// ── Indian Phone Validator ───────────────────────────────────────────────────

export const isIndianPhone = (sanitizedPhone: string): boolean => {
  if (!sanitizedPhone) return false;
  const digits = sanitizedPhone.replace("+", "");
  if (digits.length === 10) return true;
  if (digits.length === 12 && digits.startsWith("91")) return true;
  return false;
};

// ── Row Normalizer ───────────────────────────────────────────────────────────

const normalizeRow = (row: Record<string, unknown>): LeadRow => {
  const str = (val: unknown): string | undefined => {
    if (val === null || val === undefined || val === "") return undefined;
    const s = String(val).trim();
    return s === "" ? undefined : s;
  };

  return {
    name: str(row["customer_name"]) ?? null,
    phone: sanitizePhone(str(row["contact_number"]) ?? ""),
    email: str(row["email"]),
    company: str(row["company"]),
    ...Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, str(v) ?? null]),
    ),
  };
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const normalizeRecordKeys = <T extends Record<string, unknown>>(
  record: T,
): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    normalized[key.trim().toLowerCase()] = value;
  }
  return normalized;
};

const assertContactNumberHeader = (
  headerInfo: HeaderValidationResult,
): void => {
  if (headerInfo.rawHeaders.length > 0 && !headerInfo.hasContactNumber) {
    throw new MissingRequiredHeaderError(headerInfo.rawHeaders);
  }
};

// ── File-Based Parsing (backward compatibility) ─────────────────────────────

const parseCSVFile = (
  filePath: string,
): { rows: LeadRow[]; headerInfo: HeaderValidationResult } => {
  const content = fs.readFileSync(filePath);
  let rawHeaders: string[] = [];

  const records = parse(content, {
    columns: (headers: string[]) => {
      rawHeaders = headers.map((h) => h.trim());
      return headers.map((h) => h.trim().toLowerCase());
    },
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];

  const headerInfo = validateLeadHeaders(rawHeaders);
  assertContactNumberHeader(headerInfo);

  return { rows: records.map(normalizeRow), headerInfo };
};

const parseExcelFile = (
  filePath: string,
): { rows: LeadRow[]; headerInfo: HeaderValidationResult } => {
  const workbook = XLSX.readFile(filePath, {
    type: "file",
    cellText: true,
    cellDates: false,
    raw: false,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel file has no sheets");
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error(`Sheet "${sheetName}" could not be read`);

  const rawRecords = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    worksheet,
    { defval: "", raw: false, blankrows: false },
  );

  const rawHeaders = rawRecords.length > 0 ? Object.keys(rawRecords[0]) : [];
  const headerInfo = validateLeadHeaders(rawHeaders);
  assertContactNumberHeader(headerInfo);

  const rows = rawRecords.map(normalizeRecordKeys).map(normalizeRow);

  return { rows, headerInfo };
};

export const parseLeadFile = (
  filePath: string,
): { rows: LeadRow[]; headerInfo: HeaderValidationResult } => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".csv":
      return parseCSVFile(filePath);
    case ".xlsx":
    case ".xls":
      return parseExcelFile(filePath);
    default:
      throw new Error(
        `Unsupported file format: "${ext}". Supported: CSV, XLS, XLSX`,
      );
  }
};

export const parseCSV = parseLeadFile;

// ── Buffer-Based Parsing (primary — for memory storage) ─────────────────────

const parseCSVBuffer = (
  buffer: Buffer,
): { rows: LeadRow[]; headerInfo: HeaderValidationResult } => {
  let rawHeaders: string[] = [];

  const records = parse(buffer, {
    columns: (headers: string[]) => {
      rawHeaders = headers.map((h) => h.trim());
      return headers.map((h) => h.trim().toLowerCase());
    },
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];

  const headerInfo = validateLeadHeaders(rawHeaders);
  assertContactNumberHeader(headerInfo);

  return { rows: records.map(normalizeRow), headerInfo };
};

const parseExcelBuffer = (
  buffer: Buffer,
  _extension: string,
): { rows: LeadRow[]; headerInfo: HeaderValidationResult } => {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellText: true,
    cellDates: false,
    raw: false,
  });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel file has no sheets");

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error(`Sheet "${sheetName}" could not be read`);

  // 1. Extract raw headers directly from the first row of the sheet (header: 1)
  const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (sheetRows.length === 0) {
    return {
      rows: [],
      headerInfo: {
        hasContactNumber: false,
        hasCustomerName: false,
        rawHeaders: [],
      },
    };
  }

  // Row 0 is the header array
  const rawHeaders = (sheetRows[0] || [])
    .map((h) => String(h ?? "").trim())
    .filter(Boolean);

  const headerInfo = validateLeadHeaders(rawHeaders);
  assertContactNumberHeader(headerInfo);

  // 2. Extract records as key-value objects
  const rawRecords = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    worksheet,
    { defval: "", raw: false, blankrows: false },
  );

  const rows = rawRecords.map(normalizeRecordKeys).map(normalizeRow);

  return { rows, headerInfo };
};

export const parseLeadBuffer = (
  buffer: Buffer,
  fileName: string,
): { rows: LeadRow[]; headerInfo: HeaderValidationResult } => {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".csv":
      return parseCSVBuffer(buffer);
    case ".xlsx":
    case ".xls":
      return parseExcelBuffer(buffer, ext);
    default:
      throw new Error(
        `Unsupported file format: "${ext}". Supported: CSV, XLS, XLSX`,
      );
  }
};

export function detectFileType(fileName: string): SupportedFileType | null {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".csv":
      return "csv";
    case ".xlsx":
      return "xlsx";
    case ".xls":
      return "xls";
    default:
      return null;
  }
}
