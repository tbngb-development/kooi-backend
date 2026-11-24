import type { Request, Response, NextFunction } from "express";
import type { TenantAuthContext } from "../../../shared/types";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { TeamInviteMessages } from "../../../shared/constants/messages";
import type { InvitationService } from "../application/services/invitation.service";
import type {
  CreateInvitationBody,
  ListInvitationsQuery,
} from "./invitation.schema";

/** Tenant-scoped invitation management for OWNER/ADMIN actors. */
export class TenantInvitationController {
  constructor(private readonly service: InvitationService) {}

  create = async (
    req: Request<unknown, unknown, CreateInvitationBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const auth = (req as unknown as Request & { user: TenantAuthContext }).user;
      const result = await this.service.createOrResend({
        tenantId: auth.tenantId,
        inviterId: auth.userId,
        inviterRole: auth.tenantRole,
        email: req.body.email,
        role: req.body.role,
      });
      sendSuccess(
        res,
        { invitation: result.invitation, resent: result.resent },
        HttpStatus.CREATED,
        result.resent ? TeamInviteMessages.RESENT : TeamInviteMessages.CREATED,
      );
    } catch (err) {
      next(err);
    }
  };

  list = async (
    req: Request<unknown, unknown, unknown, ListInvitationsQuery>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const auth = (req as unknown as Request & { user: TenantAuthContext }).user;
      const items = await this.service.list({
        tenantId: auth.tenantId,
        status: req.query.status,
      });
      sendSuccess(res, { items }, HttpStatus.OK, TeamInviteMessages.LISTED);
    } catch (err) {
      next(err);
    }
  };

  resend = async (
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const auth = (req as unknown as Request & { user: TenantAuthContext }).user;
      const result = await this.service.resend(auth.tenantId, req.params.id);
      sendSuccess(
        res,
        { invitation: result.invitation, resent: true },
        HttpStatus.OK,
        TeamInviteMessages.RESENT,
      );
    } catch (err) {
      next(err);
    }
  };

  revoke = async (
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const auth = (req as unknown as Request & { user: TenantAuthContext }).user;
      const invitation = await this.service.revoke(auth.tenantId, req.params.id);
      sendSuccess(
        res,
        { invitation },
        HttpStatus.OK,
        TeamInviteMessages.REVOKED,
      );
    } catch (err) {
      next(err);
    }
  };

  seats = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const auth = (req as unknown as Request & { user: TenantAuthContext }).user;
      const seats = await this.service.getSeats(auth.tenantId);
      sendSuccess(res, seats, HttpStatus.OK, TeamInviteMessages.SEATS);
    } catch (err) {
      next(err);
    }
  };
}
