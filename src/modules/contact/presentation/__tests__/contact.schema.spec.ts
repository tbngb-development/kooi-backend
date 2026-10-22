import { describe, it, expect } from "vitest";
import {
  demoSubmissionSchema,
  salesSubmissionSchema,
  supportSubmissionSchema,
  bugReportSubmissionSchema,
  publicContactSchema,
  tenantContactSchema,
} from "../contact.schema";

describe("demoSubmissionSchema", () => {
  it("should validate a valid demo booking request", () => {
    const result = demoSubmissionSchema.safeParse({
      name: "Rohan Patel",
      email: "rohan@realestate.in",
      companyName: "Patel Realty Group",
      phone: "+91 98765 43210",
      industry: "Real Estate",
      preferredDate: "2026-11-01",
      preferredTime: "Morning (09:00 - 12:00 IST)",
      message: "We want autonomous qualification for 20,000 monthly inquiries.",
    });

    expect(result.success).toBe(true);
  });

  it("should reject demo submission without company name", () => {
    const result = demoSubmissionSchema.safeParse({
      name: "Rohan Patel",
      email: "rohan@realestate.in",
      companyName: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("salesSubmissionSchema", () => {
  it("should validate a valid enterprise sales inquiry", () => {
    const result = salesSubmissionSchema.safeParse({
      name: "Sneha Roy",
      email: "sneha@fintech.co",
      companyName: "FinTech Scale",
      teamSize: "51-200",
      expectedVolume: "100,000+",
      message: "Looking for custom volume pricing and dedicated SIP trunking.",
    });

    expect(result.success).toBe(true);
  });
});

describe("supportSubmissionSchema", () => {
  it("should validate a support ticket with priority and category", () => {
    const result = supportSubmissionSchema.safeParse({
      category: "Billing & Wallet",
      priority: "HIGH",
      subject: "Credits not reflected after recharge",
      message: "Payment ID pay_123 succeeded but wallet ledger is unchanged.",
    });

    expect(result.success).toBe(true);
  });
});

describe("bugReportSubmissionSchema", () => {
  it("should validate a bug report with reproduction steps", () => {
    const result = bugReportSubmissionSchema.safeParse({
      severity: "CRITICAL",
      subject: "Call export fails with 500 error",
      stepsToReproduce: "1. Go to Call History. 2. Filter by date. 3. Click Export CSV.",
      currentUrl: "https://kooi.io/call-history",
      browserInfo: "Chrome 128 on macOS",
    });

    expect(result.success).toBe(true);
  });
});

describe("publicContactSchema", () => {
  it("should validate a valid minimal submission", () => {
    const validData = {
      formType: "SALES",
      name: "John Doe",
      email: "john@example.com",
      subject: "Pricing inquiry",
      message: "Hello, I want to know more about KOOI enterprise plans.",
    };

    const result = publicContactSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("should validate all 4 allowed form types", () => {
    const types = ["SALES", "SUPPORT", "DEMO", "BUG_REPORT"] as const;

    types.forEach((formType) => {
      const result = publicContactSchema.safeParse({
        formType,
        name: "Test User",
        email: "test@domain.com",
        subject: `Test subject for ${formType}`,
        message: "Valid test message longer than 5 chars",
      });
      expect(result.success).toBe(true);
    });
  });

  it("should reject invalid form type", () => {
    const result = publicContactSchema.safeParse({
      formType: "INVALID_TYPE",
      name: "John Doe",
      email: "john@example.com",
      subject: "Test",
      message: "Valid message content",
    });

    expect(result.success).toBe(false);
  });

  it("should reject invalid email format", () => {
    const result = publicContactSchema.safeParse({
      formType: "SUPPORT",
      name: "John Doe",
      email: "not-an-email",
      subject: "Help needed",
      message: "Valid message content",
    });

    expect(result.success).toBe(false);
  });

  it("should reject empty or whitespace-only name", () => {
    const result = publicContactSchema.safeParse({
      formType: "SUPPORT",
      name: "   ",
      email: "user@example.com",
      subject: "Help needed",
      message: "Valid message content",
    });

    expect(result.success).toBe(false);
  });

  it("should reject messages that exceed length limit (5000 chars)", () => {
    const oversizedMessage = "a".repeat(5001);
    const result = publicContactSchema.safeParse({
      formType: "SALES",
      name: "John",
      email: "john@example.com",
      subject: "Oversized test",
      message: oversizedMessage,
    });

    expect(result.success).toBe(false);
  });
});

describe("tenantContactSchema", () => {
  it("should validate submission when name and email are omitted (resolved by session)", () => {
    const result = tenantContactSchema.safeParse({
      formType: "SUPPORT",
      subject: "Need help with phone numbers",
      message: "Our inbound telephony routing is encountering timeouts.",
      category: "AI Voice & Telephony",
      priority: "HIGH",
    });

    expect(result.success).toBe(true);
  });

  it("should allow optional email and name overrides", () => {
    const result = tenantContactSchema.safeParse({
      formType: "BUG_REPORT",
      name: "Alice Operator",
      email: "alice@company.com",
      subject: "Export CSV button issue",
      message: "Clicking export leads produces an empty file.",
      severity: "MEDIUM",
    });

    expect(result.success).toBe(true);
  });

  it("should reject unaccepted tenant form types like DEMO", () => {
    const result = tenantContactSchema.safeParse({
      formType: "DEMO",
      subject: "Schedule demo",
      message: "We want a demo please.",
    });

    expect(result.success).toBe(false);
  });
});
