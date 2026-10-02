import fs from "fs";
import pdfParse from "pdf-parse";
import { AppError } from "../../../shared/errors";
import { HttpStatus } from "../../../shared/constants";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PDFExtractionResult {
  rawText: string;
  pageCount: number;
  textLength: number;
  fileSizeBytes: number;
  fileSizeMB: string;
  fileName: string;
  extractedAt: string;
  truncated: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_TEXT_CHARS = 3_200_000;

// ─── Main Extractor ───────────────────────────────────────────────────────────
export async function extractTextFromPDF(
  filePath: string,
  fileName: string,
): Promise<PDFExtractionResult> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`PDF file not found at path: ${filePath}`);
  }

  const fileSizeBytes = fs.statSync(filePath).size;
  const fileSizeMB = fileSizeBytes / (1024 * 1024);

  console.info(
    `[PDFExtractor] Processing: ${fileName} | Size: ${fileSizeMB.toFixed(2)}MB`,
  );

  const dataBuffer = fs.readFileSync(filePath);

  // eslint-disable-next-line no-useless-assignment
  let pageCount = 0;
  // eslint-disable-next-line no-useless-assignment
  let rawText = "";

  try {
    const pdfData = await pdfParse(dataBuffer);
    pageCount = pdfData.numpages;
    rawText = pdfData.text;
  } catch (parseError: unknown) {
    const error = parseError as Error;
    if (error.message?.includes("No password")) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        "PDF is password protected. Please upload an unlocked PDF.",
        "PDF_PROTECTED_BY_PASSWORD",
      );
    }
    if (error.message?.includes("Invalid")) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        "PDF appears to be corrupted or is not a valid PDF file.",
        "INVALID_PDF_FILE_UNABLE_TO_PROCESS",
      );
    }
    throw new AppError(
      HttpStatus.BAD_REQUEST,
      `PDF parsing failed: ${error.message}`,
      "UNABLE_TO_PROCESS_PDF",
    );
  }

  rawText = cleanExtractedText(rawText);

  let truncated = false;
  if (rawText.length > MAX_TEXT_CHARS) {
    console.warn(
      `[PDFExtractor] Text exceeds ${MAX_TEXT_CHARS} chars. Truncating.`,
    );
    rawText = rawText.substring(0, MAX_TEXT_CHARS);
    truncated = true;
  }

  const result: PDFExtractionResult = {
    rawText,
    pageCount,
    textLength: rawText.length,
    fileSizeBytes,
    fileSizeMB: fileSizeMB.toFixed(2),
    fileName,
    extractedAt: new Date().toISOString(),
    truncated,
  };

  console.info(
    `[PDFExtractor] Done: ${pageCount} pages | ${rawText.length} chars | Truncated: ${truncated}`,
  );

  return result;
}

// ─── Text Cleaner ─────────────────────────────────────────────────────────────
function cleanExtractedText(text: string): string {
  return (
    text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .replace(/ {2,}/g, " ")
      .replace(/^\s+$/gm, "")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .trim()
  );
}

// ─── Quality Assessment ───────────────────────────────────────────────────────
export function assessTextQuality(result: PDFExtractionResult): {
  hasUsableText: boolean;
  avgCharsPerPage: number;
  warning: string | null;
} {
  const avgCharsPerPage =
    result.pageCount > 0 ? Math.round(result.textLength / result.pageCount) : 0;

  const hasUsableText = avgCharsPerPage > 100;

  let warning: string | null = null;

  if (result.textLength === 0) {
    warning =
      "No text could be extracted. This PDF appears to be entirely image-based. OCR would be needed.";
  } else if (avgCharsPerPage < 100) {
    warning = `Very little text extracted (avg ${avgCharsPerPage} chars/page). PDF may be mostly images.`;
  } else if (avgCharsPerPage < 500) {
    warning = `Low text density detected (avg ${avgCharsPerPage} chars/page). Some pages may be image-based.`;
  }

  return { hasUsableText, avgCharsPerPage, warning };
}
