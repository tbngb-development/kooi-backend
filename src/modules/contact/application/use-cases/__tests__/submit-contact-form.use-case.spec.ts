import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubmitContactFormUseCase } from "../submit-contact-form.use-case";
import type { IContactEmailService, ContactEmailPayload } from "../../interfaces/contact-email-service.interface";
import type { ContactSubmissionDto } from "../../dto/contact-form.dto";
import {
  SpamDetectedError,
  EmailDeliveryError,
} from "../../../domain/errors/contact.errors";
import { env } from "../../../../../shared/config/env";

describe("SubmitContactFormUseCase", () => {
  let mockEmailService: IContactEmailService;
  let useCase: SubmitContactFormUseCase;
  let sentPayloads: ContactEmailPayload[];

  beforeEach(() => {
    sentPayloads = [];
    mockEmailService = {
      send: vi.fn(async (payload: ContactEmailPayload) => {
        sentPayloads.push(payload);
        return { success: true, id: "msg_123" };
      }),
    };
    useCase = new SubmitContactFormUseCase(mockEmailService);
  });

  describe("Recipient routing and form types", () => {
    it("should route SALES submission to configured sales email", async () => {
      const dto: ContactSubmissionDto = {
        formType: "SALES",
        name: "Alice Founder",
        email: "alice@acme.com",
        subject: "Enterprise inquiry for 50k calls",
        message: "We need custom pricing for our real estate firm.",
        companyName: "Acme Real Estate",
        phone: "+91 9876543210",
        expectedVolume: "25,000-100,000",
      };

      const result = await useCase.execute(dto);

      expect(result.success).toBe(true);
      expect(mockEmailService.send).toHaveBeenCalledTimes(1);
      expect(sentPayloads[0].to).toBe(env.contact.salesEmail);
      expect(sentPayloads[0].replyTo).toBe("alice@acme.com");
      expect(sentPayloads[0].subject).toContain("[KOOI Sales Inquiry]");
      expect(sentPayloads[0].html).toContain("Acme Real Estate");
      expect(sentPayloads[0].html).toContain("25,000-100,000");
    });

    it("should route SUPPORT submission to configured support email", async () => {
      const dto: ContactSubmissionDto = {
        formType: "SUPPORT",
        name: "Bob Client",
        email: "bob@tech.com",
        subject: "Cannot top up prepaid wallet",
        message: "Razorpay modal hung during checkout.",
        category: "Billing & Wallet",
        priority: "HIGH",
      };

      const result = await useCase.execute(dto);

      expect(result.success).toBe(true);
      expect(sentPayloads[0].to).toBe(env.contact.supportEmail);
      expect(sentPayloads[0].subject).toContain("[KOOI Support Request]");
      expect(sentPayloads[0].html).toContain("Billing &amp; Wallet");
      expect(sentPayloads[0].html).toContain("HIGH");
    });

    it("should route DEMO submission to configured demo email", async () => {
      const dto: ContactSubmissionDto = {
        formType: "DEMO",
        name: "Charlie Director",
        email: "charlie@hospital.org",
        subject: "Demo for healthcare patient outreach",
        message: "We'd like to see automated appointment follow-ups.",
        preferredDate: "2026-11-01",
        preferredTime: "14:00 IST",
        industry: "Healthcare",
      };

      const result = await useCase.execute(dto);

      expect(result.success).toBe(true);
      expect(sentPayloads[0].to).toBe(env.contact.demoEmail);
      expect(sentPayloads[0].subject).toContain("[KOOI Demo Booking]");
      expect(sentPayloads[0].html).toContain("Healthcare");
      expect(sentPayloads[0].html).toContain("2026-11-01 14:00 IST");
    });

    it("should route BUG_REPORT submission to configured bug report email", async () => {
      const dto: ContactSubmissionDto = {
        formType: "BUG_REPORT",
        name: "David Tester",
        email: "david@test.com",
        subject: "Campaign analytics chart fails to render on Safari",
        message: "Chart displays a white box after switching date ranges.",
        severity: "HIGH",
        currentUrl: "https://app.kooi.io/dashboard",
        stepsToReproduce: "1. Open dashboard\n2. Change date filter\n3. Observe blank chart",
        browserInfo: "Safari 17.4 / macOS 14.3",
      };

      const result = await useCase.execute(dto);

      expect(result.success).toBe(true);
      expect(sentPayloads[0].to).toBe(env.contact.bugReportEmail);
      expect(sentPayloads[0].subject).toContain("[KOOI Bug Report]");
      expect(sentPayloads[0].html).toContain("Safari 17.4");
      expect(sentPayloads[0].html).toContain("Change date filter");
    });
  });

  describe("Spam protection", () => {
    it("should reject submission when honeypot field is filled", async () => {
      const dto: ContactSubmissionDto = {
        formType: "SALES",
        name: "Spam Bot",
        email: "bot@spammer.com",
        subject: "Buy cheap goods",
        message: "Spam content here",
        _hp: "http://bot-website.com",
      };

      await expect(useCase.execute(dto)).rejects.toThrow(SpamDetectedError);
      expect(mockEmailService.send).not.toHaveBeenCalled();
    });
  });

  describe("Authentication context inclusion", () => {
    it("should embed verified authenticated user and tenant details in email", async () => {
      const dto: ContactSubmissionDto = {
        formType: "SUPPORT",
        name: "Logged-In User",
        email: "user@customdomain.com",
        subject: "Call latency question",
        message: "Need help optimizing voice turn latency.",
      };

      const authContext = {
        userId: "usr_998877",
        userEmail: "verified@organization.com",
        userName: "Verified Sarah",
        tenantId: "ten_112233",
        tenantName: "Apex Voice AI",
        role: "OWNER",
        isPlatformAdmin: false,
      };

      await useCase.execute(dto, authContext, { ip: "192.168.1.100" });

      const emailHtml = sentPayloads[0].html;
      expect(emailHtml).toContain("Verified Authenticated User");
      expect(emailHtml).toContain("usr_998877");
      expect(emailHtml).toContain("verified@organization.com");
      expect(emailHtml).toContain("Apex Voice AI");
      expect(emailHtml).toContain("OWNER");
      expect(emailHtml).toContain("IP: 192.168.1.100");
    });

    it("should mark public visitor when not authenticated", async () => {
      const dto: ContactSubmissionDto = {
        formType: "SALES",
        name: "Public Visitor",
        email: "visitor@external.com",
        subject: "General query",
        message: "Looking for pricing details.",
      };

      await useCase.execute(dto, undefined);

      const emailHtml = sentPayloads[0].html;
      expect(emailHtml).toContain("Public Unauthenticated Visitor");
      expect(emailHtml).not.toContain("Verified Authenticated User");
    });
  });

  describe("Email delivery failure handling", () => {
    it("should propagate error when email provider fails", async () => {
      mockEmailService.send = vi.fn().mockRejectedValue(new EmailDeliveryError("Service unavailable"));

      const dto: ContactSubmissionDto = {
        formType: "SALES",
        name: "Alice",
        email: "alice@acme.com",
        subject: "Inquiry",
        message: "Message text",
      };

      await expect(useCase.execute(dto)).rejects.toThrow(EmailDeliveryError);
    });
  });
});
