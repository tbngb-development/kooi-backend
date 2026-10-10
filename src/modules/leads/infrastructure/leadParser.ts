import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { MissingRequiredHeaderError } from "../domain/errors/lead.errors";
import { cleanCustomerName } from "../domain/rules/name.rules";
import { isValidE164, isIndianPhone } from "../domain/rules/phone.rules";

export { isValidE164, isIndianPhone };

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

// ── Recognized Aliases ───────────────────────────────────────────────────────

export const NAME_ALIASES = [
  "customer_name",
  "{{customer_name}}",
  "customer name",
  "name",
  "full_name",
  "fullname",
  "client_name",
  "lead_name",
];

export const PHONE_ALIASES = [
  "contact_number",
  "{{contact_number}}",
  "contact number",
  "phone",
  "{{phone}}",
  "phone_number",
  "phone number",
  "mobile",
  "mobile_number",
  "mobile number",
];

// ── Header Validator ─────────────────────────────────────────────────────────

export function validateLeadHeaders(
  rawHeaders: string[],
): HeaderValidationResult {
  const normalized = rawHeaders.map((h) => h.trim().toLowerCase());
  return {
    hasContactNumber: normalized.some((h) => PHONE_ALIASES.includes(h)),
    hasCustomerName: normalized.some((h) => NAME_ALIASES.includes(h)),
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

// ── Row Normalizer ───────────────────────────────────────────────────────────

const findValueByAliases = (
  row: Record<string, unknown>,
  aliases: string[],
): unknown => {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && row[alias] !== "") {
      return row[alias];
    }
  }
  return undefined;
};

const normalizeRow = (row: Record<string, unknown>): LeadRow => {
  const str = (val: unknown): string | undefined => {
    if (val === null || val === undefined || val === "") return undefined;
    const s = String(val).trim();
    return s === "" ? undefined : s;
  };

  // Extract name & phone checking all alias variations (e.g. {{customer_name}})
  const rawName = findValueByAliases(row, NAME_ALIASES);
  const rawPhone = findValueByAliases(row, PHONE_ALIASES);

  return {
    name: cleanCustomerName(str(rawName)),
    phone: sanitizePhone(str(rawPhone) ?? ""),
    email: str(row["email"] ?? row["email_address"] ?? row["email address"]),
    company: str(row["company"] ?? row["company_name"] ?? row["company name"]),
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

// ── File-Based Parsing ───────────────────────────────────────────────────────

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

// ── Buffer-Based Parsing ────────────────────────────────────────────────────

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

  const rawHeaders = (sheetRows[0] || [])
    .map((h) => String(h ?? "").trim())
    .filter(Boolean);

  const headerInfo = validateLeadHeaders(rawHeaders);
  assertContactNumberHeader(headerInfo);

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
