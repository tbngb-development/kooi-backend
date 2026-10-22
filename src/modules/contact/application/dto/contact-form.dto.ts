export type ContactFormType = "SALES" | "SUPPORT" | "DEMO" | "BUG_REPORT";

export interface ContactSubmissionDto {
  formType: ContactFormType;
  name: string;
  email: string;
  subject: string;
  message: string;

  // Honeypot for spam detection
  _hp?: string;

  // SALES specific
  companyName?: string;
  phone?: string;
  teamSize?: string;
  expectedVolume?: string;

  // DEMO specific
  preferredDate?: string;
  preferredTime?: string;
  industry?: string;

  // SUPPORT specific
  category?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  affectedUrl?: string;

  // BUG_REPORT specific
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  currentUrl?: string;
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  browserInfo?: string;
}

export interface AuthenticatedContextInfo {
  userId?: string;
  userEmail?: string;
  userName?: string;
  tenantId?: string;
  tenantName?: string;
  role?: string;
  isPlatformAdmin?: boolean;
}

export interface ContactSubmissionResultDto {
  success: boolean;
  message: string;
}
