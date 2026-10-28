import { z } from "zod";

// Helper validators
const nameValidator = z
  .string()
  .trim()
  .min(3, "Name must be at least 3 characters")
  .max(100, "Name must not exceed 100 characters");

const emailValidator = z
  .email("Please provide a valid email address")
  .max(255, "Email must not exceed 255 characters")
  .transform((val) => val.trim().toLowerCase());

const subjectValidator = z
  .string()
  .min(1, "Subject is required")
  .max(200, "Subject must not exceed 200 characters")
  .refine((val) => val.trim().length > 0, {
    message: "Subject cannot be empty",
  })
  .transform((val) => val.trim());

const messageValidator = z
  .string()
  .min(5, "Message must be at least 5 characters")
  .max(5000, "Message must not exceed 5000 characters")
  .refine((val) => val.trim().length >= 5, {
    message: "Message must be at least 5 characters",
  })
  .transform((val) => val.trim());

const honeypotValidator = z.string().max(100).optional();

// ── Action-Specific Schemas ────────────────────────────────────────────────

/**
 * 1. Book a Demo Schema
 * For prospective customers requesting a live voice qualification agent walkthrough.
 */
export const demoSubmissionSchema = z.object({
  name: nameValidator,
  email: emailValidator,
  companyName: z.string().min(1, "Company name is required").max(100).trim(),
  phone: z.string().max(30).trim().optional(),
  industry: z.string().max(100).trim().optional(),
  preferredDate: z.string().max(50).trim().optional(),
  preferredTime: z.string().max(50).trim().optional(),
  message: z.string().max(5000).trim().optional(),
  _hp: honeypotValidator,
});

/**
 * 2. Contact Sales / Enterprise Schema
 * For high-volume calling, custom SLAs, or enterprise architecture inquiries.
 */
export const salesSubmissionSchema = z.object({
  name: z.string().max(100).trim().optional(),
  email: z
    .email("Please provide a valid email address")
    .max(255)
    .trim()
    .toLowerCase()
    .optional(),
  companyName: z.string().min(1, "Company name is required").max(100).trim(),
  phone: z.string().max(30).trim().optional(),
  teamSize: z.string().max(50).trim().optional(),
  expectedVolume: z.string().max(50).trim().optional(),
  subject: z.string().max(200).trim().optional(),
  message: messageValidator,
  _hp: honeypotValidator,
});

/**
 * 3. Support Ticket Schema
 * For technical assistance, billing, telephony routing, or campaigns.
 */
export const supportSubmissionSchema = z.object({
  category: z.string().min(1, "Category is required").max(100).trim(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  subject: subjectValidator,
  message: messageValidator,
  affectedUrl: z.string().max(500).trim().optional(),
  name: z.string().max(100).trim().optional(),
  email: z
    .email("Please provide a valid email address")
    .max(255)
    .trim()
    .toLowerCase()
    .optional(),
  _hp: honeypotValidator,
});

/**
 * 4. Bug Report Schema
 * For reporting unexpected errors, UI glitches, or telephony call failures.
 */
export const bugReportSubmissionSchema = z.object({
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  subject: subjectValidator,
  stepsToReproduce: z
    .string()
    .min(5, "Please provide steps to reproduce the issue")
    .max(3000)
    .trim(),
  expectedBehavior: z.string().max(1000).trim().optional(),
  actualBehavior: z.string().max(1000).trim().optional(),
  currentUrl: z.string().max(500).trim().optional(),
  browserInfo: z.string().max(500).trim().optional(),
  message: z.string().max(5000).trim().optional(),
  name: z.string().max(100).trim().optional(),
  email: z
    .email("Please provide a valid email address")
    .max(255)
    .trim()
    .toLowerCase()
    .optional(),
  _hp: honeypotValidator,
});

// ── General Fallback Schemas (Backward Compatibility) ──────────────────────

export const publicContactSchema = z.object({
  formType: z.enum(["SALES", "SUPPORT", "DEMO", "BUG_REPORT"], {
    message: "Form type must be one of: SALES, SUPPORT, DEMO, BUG_REPORT",
  }),
  name: nameValidator,
  email: emailValidator,
  subject: subjectValidator,
  message: messageValidator,
  _hp: honeypotValidator,
  companyName: z.string().max(100).trim().optional(),
  phone: z.string().max(30).trim().optional(),
  teamSize: z.string().max(50).trim().optional(),
  expectedVolume: z.string().max(50).trim().optional(),
  preferredDate: z.string().max(50).trim().optional(),
  preferredTime: z.string().max(50).trim().optional(),
  industry: z.string().max(100).trim().optional(),
  category: z.string().max(100).trim().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  affectedUrl: z.string().max(500).trim().optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  currentUrl: z.string().max(500).trim().optional(),
  stepsToReproduce: z.string().max(3000).trim().optional(),
  expectedBehavior: z.string().max(1000).trim().optional(),
  actualBehavior: z.string().max(1000).trim().optional(),
  browserInfo: z.string().max(500).trim().optional(),
});

export const tenantContactSchema = z.object({
  formType: z.enum(["SUPPORT", "BUG_REPORT", "SALES"], {
    message: "Tenant form type must be one of: SUPPORT, BUG_REPORT, SALES",
  }),
  subject: subjectValidator,
  message: messageValidator,
  name: z.string().max(100).trim().optional(),
  email: z
    .email("Please provide a valid email address")
    .max(255)
    .trim()
    .toLowerCase()
    .optional(),
  _hp: honeypotValidator,
  companyName: z.string().max(100).trim().optional(),
  phone: z.string().max(30).trim().optional(),
  category: z.string().max(100).trim().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  affectedUrl: z.string().max(500).trim().optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  currentUrl: z.string().max(500).trim().optional(),
  stepsToReproduce: z.string().max(3000).trim().optional(),
  expectedBehavior: z.string().max(1000).trim().optional(),
  actualBehavior: z.string().max(1000).trim().optional(),
  browserInfo: z.string().max(500).trim().optional(),
  teamSize: z.string().max(50).trim().optional(),
  expectedVolume: z.string().max(50).trim().optional(),
  industry: z.string().max(100).trim().optional(),
  preferredDate: z.string().max(50).trim().optional(),
  preferredTime: z.string().max(50).trim().optional(),
});

export const contactSubmissionSchema = publicContactSchema;

export type DemoSubmissionInput = z.infer<typeof demoSubmissionSchema>;
export type SalesSubmissionInput = z.infer<typeof salesSubmissionSchema>;
export type SupportSubmissionInput = z.infer<typeof supportSubmissionSchema>;
export type BugReportSubmissionInput = z.infer<
  typeof bugReportSubmissionSchema
>;
export type PublicContactSubmissionInput = z.infer<typeof publicContactSchema>;
export type TenantContactSubmissionInput = z.infer<typeof tenantContactSchema>;
export type ContactSubmissionInput =
  PublicContactSubmissionInput | TenantContactSubmissionInput;
