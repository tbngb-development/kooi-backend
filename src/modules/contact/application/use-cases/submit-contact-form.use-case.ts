import { env } from "../../../../shared/config/env";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type {
  ContactSubmissionDto,
  AuthenticatedContextInfo,
  ContactSubmissionResultDto,
} from "../dto/contact-form.dto";
import type { IContactEmailService } from "../interfaces/contact-email-service.interface";
import {
  SpamDetectedError,
  InvalidContactFormError,
} from "../../domain/errors/contact.errors";

export class SubmitContactFormUseCase {
  constructor(
    private readonly emailService: IContactEmailService,
    private readonly logger?: Logger,
  ) {}

  async execute(
    dto: ContactSubmissionDto,
    authContext?: AuthenticatedContextInfo,
    requestMeta?: { ip?: string; userAgent?: string },
  ): Promise<ContactSubmissionResultDto> {
    // 1. Spam detection: honeypot field must be empty
    if (dto._hp && dto._hp.trim().length > 0) {
      this.logger?.warn("Spam honeypot triggered on contact submission", {
        action: "contact.spam_detected",
        formType: dto.formType,
        email: dto.email,
        ip: requestMeta?.ip,
      });
      throw new SpamDetectedError();
    }

    // 2. Resolve recipient team email
    const recipient = this.resolveRecipientEmail(dto.formType);
    if (!recipient) {
      throw new InvalidContactFormError(`Unknown form type: ${dto.formType}`);
    }

    // 3. Format subject and HTML content
    const emailSubject = `[KOOI ${this.formatFormTypeLabel(dto.formType)}] ${dto.subject.trim()}`;
    const emailHtml = this.buildEmailHtml(dto, authContext, requestMeta);
    const emailText = this.buildPlainText(dto, authContext);

    // 4. Log without sensitive message content or credentials
    this.logger?.info("Dispatching contact form email", {
      action: "contact.submission_received",
      formType: dto.formType,
      recipient,
      isAuthenticated: Boolean(authContext?.userId),
      userId: authContext?.userId,
      tenantId: authContext?.tenantId,
    });

    // 5. Send via email service (strictly propagates failures)
    await this.emailService.send({
      to: recipient,
      replyTo: dto.email.trim(),
      subject: emailSubject,
      html: emailHtml,
      text: emailText,
    });

    return {
      success: true,
      message: "Thank you for reaching out. We will get back to you shortly.",
    };
  }

  private resolveRecipientEmail(formType: ContactSubmissionDto["formType"]): string {
    switch (formType) {
      case "SALES":
        return env.contact.salesEmail;
      case "SUPPORT":
        return env.contact.supportEmail;
      case "DEMO":
        return env.contact.demoEmail;
      case "BUG_REPORT":
        return env.contact.bugReportEmail;
      default:
        return env.contact.supportEmail;
    }
  }

  private formatFormTypeLabel(formType: ContactSubmissionDto["formType"]): string {
    switch (formType) {
      case "SALES":
        return "Sales Inquiry";
      case "SUPPORT":
        return "Support Request";
      case "DEMO":
        return "Demo Booking";
      case "BUG_REPORT":
        return "Bug Report";
      default:
        return "Contact";
    }
  }

  private escapeHtml(str?: string): string {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private buildEmailHtml(
    dto: ContactSubmissionDto,
    authContext?: AuthenticatedContextInfo,
    requestMeta?: { ip?: string; userAgent?: string },
  ): string {
    const label = this.formatFormTypeLabel(dto.formType);
    const badgeColor =
      dto.formType === "SALES"
        ? "#0284c7"
        : dto.formType === "DEMO"
          ? "#10b981"
          : dto.formType === "BUG_REPORT"
            ? "#ef4444"
            : "#6366f1";

    const authSectionHtml = authContext?.userId
      ? `
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; margin-bottom: 6px;">
            Verified Authenticated User
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #1e293b;">
            <tr>
              <td style="padding: 2px 0; color: #64748b; width: 120px;">User ID:</td>
              <td style="padding: 2px 0; font-family: monospace;">${this.escapeHtml(authContext.userId)}</td>
            </tr>
            <tr>
              <td style="padding: 2px 0; color: #64748b;">Verified Name:</td>
              <td style="padding: 2px 0;">${this.escapeHtml(authContext.userName)}</td>
            </tr>
            <tr>
              <td style="padding: 2px 0; color: #64748b;">Verified Email:</td>
              <td style="padding: 2px 0;">${this.escapeHtml(authContext.userEmail)}</td>
            </tr>
            ${
              authContext.tenantName
                ? `<tr>
                    <td style="padding: 2px 0; color: #64748b;">Workspace:</td>
                    <td style="padding: 2px 0;">${this.escapeHtml(authContext.tenantName)} (${this.escapeHtml(authContext.tenantId)})</td>
                   </tr>`
                : ""
            }
            ${
              authContext.role
                ? `<tr>
                    <td style="padding: 2px 0; color: #64748b;">Role:</td>
                    <td style="padding: 2px 0; font-weight: 600;">${this.escapeHtml(authContext.role)}</td>
                   </tr>`
                : ""
            }
          </table>
        </div>
      `
      : `
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 16px; margin-bottom: 20px; font-size: 12px; color: #64748b;">
          <strong>Submission Context:</strong> Public Unauthenticated Visitor
        </div>
      `;

    // Build form-specific rows
    const specificRows: Array<{ label: string; value?: string }> = [];

    if (dto.companyName) specificRows.push({ label: "Company", value: dto.companyName });
    if (dto.phone) specificRows.push({ label: "Phone", value: dto.phone });
    if (dto.teamSize) specificRows.push({ label: "Team Size", value: dto.teamSize });
    if (dto.expectedVolume) specificRows.push({ label: "Expected Monthly Calls", value: dto.expectedVolume });
    if (dto.preferredDate || dto.preferredTime) {
      specificRows.push({
        label: "Preferred Demo Time",
        value: `${dto.preferredDate || ""} ${dto.preferredTime || ""}`.trim(),
      });
    }
    if (dto.industry) specificRows.push({ label: "Industry", value: dto.industry });
    if (dto.category) specificRows.push({ label: "Issue Category", value: dto.category });
    if (dto.priority) specificRows.push({ label: "Priority", value: dto.priority });
    if (dto.severity) specificRows.push({ label: "Severity", value: dto.severity });
    if (dto.affectedUrl) specificRows.push({ label: "Affected URL / ID", value: dto.affectedUrl });
    if (dto.currentUrl) specificRows.push({ label: "Page URL", value: dto.currentUrl });
    if (dto.browserInfo) specificRows.push({ label: "Device / Browser", value: dto.browserInfo });
    if (dto.stepsToReproduce) specificRows.push({ label: "Steps to Reproduce", value: dto.stepsToReproduce });
    if (dto.expectedBehavior) specificRows.push({ label: "Expected Behavior", value: dto.expectedBehavior });
    if (dto.actualBehavior) specificRows.push({ label: "Actual Behavior", value: dto.actualBehavior });

    const specificTableHtml =
      specificRows.length > 0
        ? `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; margin-bottom: 8px;">
            Details & Context
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px;">
            ${specificRows
              .map(
                (row) => `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 12px; font-weight: 600; color: #475569; width: 160px; vertical-align: top;">${this.escapeHtml(row.label)}:</td>
                <td style="padding: 8px 12px; color: #0f172a; white-space: pre-wrap;">${this.escapeHtml(row.value)}</td>
              </tr>
            `,
              )
              .join("")}
          </table>
        </div>
      `
        : "";

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${this.escapeHtml(dto.subject)}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 24px; margin: 0; color: #0f172a;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header Banner -->
          <div style="background-color: #09090b; padding: 20px 24px; color: #ffffff; display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 18px; font-weight: 800; letter-spacing: 0.05em; color: #ffffff;">KOOI</div>
            <div style="display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background-color: ${badgeColor}; color: #ffffff;">
              ${this.escapeHtml(label)}
            </div>
          </div>

          <div style="padding: 24px;">
            <!-- Submitter info header -->
            <div style="margin-bottom: 20px;">
              <h1 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0; line-height: 1.3;">
                ${this.escapeHtml(dto.subject)}
              </h1>
              <p style="font-size: 13px; color: #64748b; margin: 0;">
                Submitted by <strong style="color: #0f172a;">${this.escapeHtml(dto.name)}</strong> &lt;<a href="mailto:${this.escapeHtml(dto.email)}" style="color: #2563eb; text-decoration: none;">${this.escapeHtml(dto.email)}</a>&gt;
              </p>
            </div>

            ${authSectionHtml}
            ${specificTableHtml}

            <!-- Main Message -->
            <div style="margin-bottom: 24px;">
              <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; margin-bottom: 8px;">
                Message Content
              </div>
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.6; color: #1e293b; white-space: pre-wrap;">
${this.escapeHtml(dto.message)}
              </div>
            </div>

            <!-- Footer / Metadata -->
            <div style="border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between;">
              <span>Submitted at: ${new Date().toUTCString()}</span>
              ${requestMeta?.ip ? `<span>IP: ${this.escapeHtml(requestMeta.ip)}</span>` : ""}
            </div>
          </div>
        </div>
      </body>
      </html>
    `.trim();
  }

  private buildPlainText(
    dto: ContactSubmissionDto,
    authContext?: AuthenticatedContextInfo,
  ): string {
    const lines = [
      `[KOOI ${this.formatFormTypeLabel(dto.formType)}] ${dto.subject}`,
      `From: ${dto.name} <${dto.email}>`,
      authContext?.userId
        ? `Authenticated User: ${authContext.userName} (${authContext.userEmail}) | ID: ${authContext.userId}`
        : "Public Visitor",
      "",
      "--- Message ---",
      dto.message,
      "",
    ];

    if (dto.companyName) lines.push(`Company: ${dto.companyName}`);
    if (dto.phone) lines.push(`Phone: ${dto.phone}`);
    if (dto.teamSize) lines.push(`Team Size: ${dto.teamSize}`);
    if (dto.expectedVolume) lines.push(`Expected Volume: ${dto.expectedVolume}`);
    if (dto.category) lines.push(`Category: ${dto.category}`);
    if (dto.priority) lines.push(`Priority: ${dto.priority}`);
    if (dto.severity) lines.push(`Severity: ${dto.severity}`);
    if (dto.stepsToReproduce) lines.push(`Steps to Reproduce: ${dto.stepsToReproduce}`);

    return lines.join("\n");
  }
}
