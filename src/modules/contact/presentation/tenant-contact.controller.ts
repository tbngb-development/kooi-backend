import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import type { SubmitContactFormUseCase } from "../application/use-cases/submit-contact-form.use-case";
import type { ContactSubmissionDto, AuthenticatedContextInfo } from "../application/dto/contact-form.dto";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import type {
  SupportSubmissionInput,
  BugReportSubmissionInput,
  SalesSubmissionInput,
} from "./contact.schema";

/**
 * Controller for authenticated tenant contact submissions.
 * Supports dedicated action handlers:
 * - POST /api/v1/contact/support
 * - POST /api/v1/contact/bug-report
 * - POST /api/v1/contact/sales
 * - POST /api/v1/contact (fallback)
 */
export class TenantContactController {
  constructor(
    private readonly submitContactForm: SubmitContactFormUseCase,
  ) {}

  private extractAuthContext(tenantUser: TenantAuthContext, bodyName?: string): AuthenticatedContextInfo {
    return {
      userId: tenantUser.userId,
      userEmail: tenantUser.email,
      userName: bodyName?.trim() || tenantUser.email.split("@")[0],
      isPlatformAdmin: tenantUser.isPlatformAdmin,
      tenantId: tenantUser.tenantId,
      role: tenantUser.tenantRole,
    };
  }

  submitSupport = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantUser = (req as AuthRequest).user as TenantAuthContext;
      const body = req.body as SupportSubmissionInput;
      const authContext = this.extractAuthContext(tenantUser, body.name);

      const dto: ContactSubmissionDto = {
        formType: "SUPPORT",
        name: body.name?.trim() || tenantUser.email.split("@")[0] || "Workspace Member",
        email: body.email?.trim().toLowerCase() || tenantUser.email,
        category: body.category,
        priority: body.priority,
        affectedUrl: body.affectedUrl,
        subject: body.subject,
        message: body.message,
        _hp: body._hp,
      };

      const result = await this.submitContactForm.execute(dto, authContext, {
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
      const tenantUser = (req as AuthRequest).user as TenantAuthContext;
      const body = req.body as BugReportSubmissionInput;
      const authContext = this.extractAuthContext(tenantUser, body.name);

      const dto: ContactSubmissionDto = {
        formType: "BUG_REPORT",
        name: body.name?.trim() || tenantUser.email.split("@")[0] || "Workspace Member",
        email: body.email?.trim().toLowerCase() || tenantUser.email,
        severity: body.severity,
        subject: body.subject,
        stepsToReproduce: body.stepsToReproduce,
        expectedBehavior: body.expectedBehavior,
        actualBehavior: body.actualBehavior,
        currentUrl: body.currentUrl,
        browserInfo: body.browserInfo,
        message: body.message?.trim() || `Steps to reproduce:\n${body.stepsToReproduce}`,
        _hp: body._hp,
      };

      const result = await this.submitContactForm.execute(dto, authContext, {
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
      const tenantUser = (req as AuthRequest).user as TenantAuthContext;
      const body = req.body as SalesSubmissionInput;
      const authContext = this.extractAuthContext(tenantUser, body.name);

      const dto: ContactSubmissionDto = {
        formType: "SALES",
        name: body.name?.trim() || tenantUser.email.split("@")[0] || "Workspace Member",
        email: body.email?.trim().toLowerCase() || tenantUser.email,
        companyName: body.companyName,
        phone: body.phone,
        teamSize: body.teamSize,
        expectedVolume: body.expectedVolume,
        subject: body.subject?.trim() || "Workspace Tier Upgrade & Custom Volume Inquiry",
        message: body.message,
        _hp: body._hp,
      };

      const result = await this.submitContactForm.execute(dto, authContext, {
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
      const tenantUser = (req as AuthRequest).user as TenantAuthContext;
      const body = req.body as Partial<ContactSubmissionDto>;
      const authContext = this.extractAuthContext(tenantUser, body.name);

      const dto: ContactSubmissionDto = {
        ...(body as ContactSubmissionDto),
        name: body.name?.trim() || tenantUser.email.split("@")[0] || "Workspace Member",
        email: body.email?.trim().toLowerCase() || tenantUser.email,
      };

      const result = await this.submitContactForm.execute(dto, authContext, {
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.get("user-agent") || undefined,
      });

      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}
