import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  validateLeadHeaders,
  parseLeadBuffer,
  detectFileType,
  MissingRequiredHeaderError,
} from "../../../src/modules/leads/infrastructure/leadParser";
import { serializeManualLeadsToCSV } from "../../../src/modules/batches/infrastructure/manual-leads-csv-serializer";

describe("Lead Parser & Manual Lead Serialization (Module 8)", () => {
  describe("validateLeadHeaders", () => {
    it("recognizes standard contact_number and customer_name headers", () => {
      const result = validateLeadHeaders(["contact_number", "customer_name"]);
      expect(result.hasContactNumber).toBe(true);
      expect(result.hasCustomerName).toBe(true);
    });

    it("recognizes alternative alias headers (phone, mobile, name, full_name, etc.)", () => {
      const result1 = validateLeadHeaders(["phone", "full_name"]);
      expect(result1.hasContactNumber).toBe(true);
      expect(result1.hasCustomerName).toBe(true);

      const result2 = validateLeadHeaders(["Mobile Number", "Customer Name"]);
      expect(result2.hasContactNumber).toBe(true);
      expect(result2.hasCustomerName).toBe(true);

      const result3 = validateLeadHeaders(["{{contact_number}}", "{{customer_name}}"]);
      expect(result3.hasContactNumber).toBe(true);
      expect(result3.hasCustomerName).toBe(true);
    });

    it("detects when contact_number is missing", () => {
      const result = validateLeadHeaders(["email", "first_name", "company"]);
      expect(result.hasContactNumber).toBe(false);
      expect(result.hasCustomerName).toBe(false);
    });
  });

  describe("detectFileType", () => {
    it("identifies supported file types", () => {
      expect(detectFileType("leads.csv")).toBe("csv");
      expect(detectFileType("LEADS.XLSX")).toBe("xlsx");
      expect(detectFileType("data.xls")).toBe("xls");
    });

    it("returns null for unsupported formats", () => {
      expect(detectFileType("leads.pdf")).toBeNull();
      expect(detectFileType("leads.json")).toBeNull();
      expect(detectFileType("leads.txt")).toBeNull();
    });
  });

  describe("parseLeadBuffer - CSV", () => {
    it("throws MissingRequiredHeaderError when CSV has headers but no contact_number", () => {
      const csv = "name,email,city\nAlice,alice@example.com,Mumbai\n";
      const buffer = Buffer.from(csv, "utf-8");

      expect(() => parseLeadBuffer(buffer, "leads.csv")).toThrow(
        MissingRequiredHeaderError,
      );
    });

    it("parses valid CSV buffer and normalizes lead data", () => {
      const csv = `contact_number,customer_name,email,company
9876543210,Dr. Alice Smith,alice@example.com,Acme Corp
+919876543211,Bob Doe,bob@example.com,Beta Inc
`;
      const buffer = Buffer.from(csv, "utf-8");
      const { rows, headerInfo } = parseLeadBuffer(buffer, "leads.csv");

      expect(headerInfo.hasContactNumber).toBe(true);
      expect(headerInfo.hasCustomerName).toBe(true);
      expect(rows).toHaveLength(2);

      expect(rows[0].phone).toBe("9876543210");
      expect(rows[0].name).toBe("Alice"); // Dr. stripped, Alice kept
      expect(rows[0].email).toBe("alice@example.com");
      expect(rows[0].company).toBe("Acme Corp");

      expect(rows[1].phone).toBe("+919876543211");
      expect(rows[1].name).toBe("Bob");
      expect(rows[1].email).toBe("bob@example.com");
      expect(rows[1].company).toBe("Beta Inc");
    });

    it("handles CSV with UTF-8 BOM, whitespace around headers, and empty lines", () => {
      const csvWithBom = `\uFEFF  contact_number  ,  customer_name  
  9876543210  ,  Charlie Brown  

  9876543211  ,  David Miller  
`;
      const buffer = Buffer.from(csvWithBom, "utf-8");
      const { rows } = parseLeadBuffer(buffer, "leads.csv");

      expect(rows).toHaveLength(2);
      expect(rows[0].phone).toBe("9876543210");
      expect(rows[0].name).toBe("Charlie");
      expect(rows[1].phone).toBe("9876543211");
      expect(rows[1].name).toBe("David");
    });

    it("throws Error for unsupported file extensions", () => {
      const buffer = Buffer.from("dummy data", "utf-8");
      expect(() => parseLeadBuffer(buffer, "leads.pdf")).toThrow(
        /Unsupported file format/,
      );
    });
  });

  describe("parseLeadBuffer - Excel (.xlsx)", () => {
    it("parses Excel buffer and extracts lead rows", () => {
      // Create in-memory workbook with XLSX
      const wb = XLSX.utils.book_new();
      const wsData = [
        ["contact_number", "customer_name", "company"],
        ["9876543210", "Vikram Rathore", "Titan Ltd"],
        ["+919876543211", "Priya Sharma", "Wipro"],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

      const excelBuffer = XLSX.write(wb, {
        type: "buffer",
        bookType: "xlsx",
      }) as Buffer;

      const { rows, headerInfo } = parseLeadBuffer(excelBuffer, "leads.xlsx");

      expect(headerInfo.hasContactNumber).toBe(true);
      expect(headerInfo.hasCustomerName).toBe(true);
      expect(rows).toHaveLength(2);
      expect(rows[0].phone).toBe("9876543210");
      expect(rows[0].name).toBe("Vikram");
      expect(rows[0].company).toBe("Titan Ltd");
      expect(rows[1].phone).toBe("+919876543211");
      expect(rows[1].name).toBe("Priya");
    });
  });

  describe("serializeManualLeadsToCSV", () => {
    it("serializes manual leads array into standard CSV buffer", () => {
      const manualLeads = [
        { contact_number: "+919876543210", customer_name: "Rahul Roy" },
        { contact_number: "9876543211", customer_name: "Anjali Gupta" },
      ];

      const csvBuffer = serializeManualLeadsToCSV(manualLeads);
      expect(Buffer.isBuffer(csvBuffer)).toBe(true);

      const parsed = parseLeadBuffer(csvBuffer, "manual-preview.csv");
      expect(parsed.rows).toHaveLength(2);
      expect(parsed.rows[0].phone).toBe("+919876543210");
      expect(parsed.rows[0].name).toBe("Rahul");
      expect(parsed.rows[1].phone).toBe("9876543211");
      expect(parsed.rows[1].name).toBe("Anjali");
    });
  });
});
