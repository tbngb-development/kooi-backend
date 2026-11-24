import type { Request, Response, NextFunction } from "express";
import type { AuthContext } from "../../../shared/types";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { TeamInviteMessages } from "../../../shared/constants/messages";
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  getCookieSameSite,
} from "../../../shared/constants/cookies";
import { env } from "../../../shared/config/env";
import { ValidationError } from "../../../shared/errors/validation.error";
import type { SelectTenantOutput } from "../../auth/application/dto/select-tenant.dto";
import type { InvitationService } from "../application/services/invitation.service";
import type {
  AcceptInvitationBody,
  PreviewInvitationQuery,
} from "./invitation.schema";

/**
 * Public preview/accept endpoints. Auth is optional: a logged-in user accepts
 * with the token alone, while a new user must supply their own name/password.
 */
export class PublicInvitationController {
  constructor(private readonly service: InvitationService) {}

  preview = async (
    req: Request<unknown, unknown, unknown, PreviewInvitationQuery>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const preview = await this.service.preview(req.query.token);
      sendSuccess(res, preview, HttpStatus.OK, TeamInviteMessages.PREVIEW);
    } catch (err) {
      next(err);
    }
  };

  accept = async (
    req: Request<unknown, unknown, AcceptInvitationBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const auth = (req as Request & { user?: AuthContext }).user;
      // API-key contexts carry no identity email and cannot accept an invite.
      const invitee = auth && "email" in auth ? auth : undefined;

      let result;
      if (invitee) {
        // Existing account: never accept a caller-supplied password/name; the
        // session identity is authoritative for who is joining.
        result = await this.service.acceptExistingUser({
          token: req.body.token,
          user: {
            id: invitee.userId,
            email: invitee.email,
            // A valid resolved session always belongs to an active user.
            isActive: true,
          },
        });
      } else {
        if (!req.body.name || !req.body.password) {
          throw new ValidationError([
            {
              field: "name",
              message: "Provide a name and password to create a new account",
            },
          ]);
        }
        result = await this.service.acceptNewUser({
          token: req.body.token,
          name: req.body.name,
          password: req.body.password,
        });
      }

      this.setTokenCookies(res, result.session);
      sendSuccess(res, result, HttpStatus.OK, TeamInviteMessages.ACCEPTED);
    } catch (err) {
      next(err);
    }
  };

  private setTokenCookies(res: Response, session: SelectTenantOutput): void {
    const isProduction = env.nodeEnv === "production";
    const sameSite = getCookieSameSite(isProduction);
    const base = {
      httpOnly: true,
      secure: isProduction,
      sameSite,
      path: "/",
    } as const;

    res.cookie(COOKIE_ACCESS_TOKEN, session.accessToken, {
      ...base,
      maxAge: session.accessTokenExpiresIn * 1000,
    });
    res.cookie(COOKIE_REFRESH_TOKEN, session.refreshToken, {
      ...base,
      maxAge: session.refreshTokenExpiresIn * 1000,
    });
  }
}
