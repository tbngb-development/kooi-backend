import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import type { SubmitContactFormUseCase } from "../application/use-cases/submit-contact-form.use-case";
import type { ContactSubmissionDto } from "../application/dto/contact-form.dto";
import type {
  DemoSubmissionInput,
  SalesSubmissionInput,
  SupportSubmissionInput,
  BugReportSubmissionInput,
} from "./contact.schema";

/**
 * Controller for public unauthenticated contact submissions.
 * Supports dedicated action handlers:
 * - POST /api/v1/public/contact/demo
 * - POST /api/v1/public/contact/sales
 * - POST /api/v1/public/contact/support
 * - POST /api/v1/public/contact/bug-report
 * - POST /api/v1/public/contact (fallback)
 */
export class PublicContactController {
  constructor(
    private readonly submitContactForm: SubmitContactFormUseCase,
  ) {}

  submitDemo = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const body = req.body as DemoSubmissionInput;
      const dto: ContactSubmissionDto = {
        formType: "DEMO",
        name: body.name,
        email: body.email,
        companyName: body.companyName,
        phone: body.phone,
        industry: body.industry,
        preferredDate: body.preferredDate,
        preferredTime: body.preferredTime,
        subject: "Live Voice Agent Demo Request",
        message:
          body.message?.trim() ||
          `Demo requested for ${body.companyName}${body.industry ? ` (${body.industry})` : ""}. Preferred slot: ${body.preferredDate || ""} ${body.preferredTime || ""}`.trim(),
        _hp: body._hp,
      };

      const result = await this.submitContactForm.execute(dto, undefined, {
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.get("user-agent") || undefined,
      });

      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  submitSales = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const body = req.body as SalesSubmissionInput;
      const dto: ContactSubmissionDto = {
        formType: "SALES",
        name: body.name || "Enterprise Prospect",
        email: body.email || "",
        companyName: body.companyName,
        phone: body.phone,
        teamSize: body.teamSize,
        expectedVolume: body.expectedVolume,
        subject: body.subject?.trim() || "Enterprise Sales & Custom Plan Inquiry",
        message: body.message,
        _hp: body._hp,
      };

      const result = await this.submitContactForm.execute(dto, undefined, {
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.get("user-agent") || undefined,
      });

      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  submitSupport = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const body = req.body as SupportSubmissionInput;
      const dto: ContactSubmissionDto = {
        formType: "SUPPORT",
        name: body.name || "Public Visitor",
        email: body.email || "",
        category: body.category,
        priority: body.priority,
        affectedUrl: body.affectedUrl,
        subject: body.subject,
        message: body.message,
        _hp: body._hp,
      };

      const result = await this.submitContactForm.execute(dto, undefined, {
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.get("user-agent") || undefined,
      });

      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  submitBugReport = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const body = req.body as BugReportSubmissionInput;
      const dto: ContactSubmissionDto = {
        formType: "BUG_REPORT",
        name: body.name || "Public Reporter",
        email: body.email || "",
        severity: body.severity,
        subject: body.subject,
        stepsToReproduce: body.stepsToReproduce,
        expectedBehavior: body.expectedBehavior,
        actualBehavior: body.actualBehavior,
        currentUrl: body.currentUrl,
        browserInfo: body.browserInfo,
        message: body.message || `Steps to reproduce:\n${body.stepsToReproduce}`,
        _hp: body._hp,
      };

      const result = await this.submitContactForm.execute(dto, undefined, {
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.get("user-agent") || undefined,
      });

      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  submit = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const dto = req.body as ContactSubmissionDto;
      const result = await this.submitContactForm.execute(dto, undefined, {
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.get("user-agent") || undefined,
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}
