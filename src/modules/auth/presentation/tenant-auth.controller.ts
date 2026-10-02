import type { Request, Response, NextFunction } from "express";
import type {
  RegisterTenantOwnerBody,
  LoginBody,
  SelectTenantBody,
  RefreshTokensBody,
  LogoutBody,
  CreateInviteBody,
  AcceptInviteBody,
  SendRegisterOtpBody,
} from "./auth.schema";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import { AuthMapper } from "./auth.mapper";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  getCookieSameSite,
} from "../../../shared/constants/cookies";
import { env } from "../../../shared/config/env";
import { UnauthorizedError } from "../../../shared/errors/unauthorized.error";
import { AuthMessages } from "../../../shared/constants/messages";
import { type RegisterTenantOwnerUseCase } from "../application/use-cases/register-tenant-owner.use-case";
import { type LoginUseCase } from "../application/use-cases/login.use-case";
import { type SelectTenantUseCase } from "../application/use-cases/select-tenant.use-case";
import { type RefreshTokensUseCase } from "../application/use-cases/refresh-tokens.use-case";
import { type GetProfileUseCase } from "../application/use-cases/get-profile.use-case";
import { type CreateInviteUseCase } from "../application/use-cases/create-invite.use-case";
import { type AcceptInviteUseCase } from "../application/use-cases/accept-invite.use-case";
import { type LogoutUseCase } from "../application/use-cases/logout.use-case";
// Add imports
import type { ForgotPasswordUseCase } from "../application/use-cases/forgot-password.use-case";
import type { VerifyForgotPasswordOtpUseCase } from "../application/use-cases/verify-forgot-password-otp.use-case";
import type { ResetPasswordUseCase } from "../application/use-cases/reset-password.use-case";
import type { ChangePasswordUseCase } from "../application/use-cases/change-password.use-case";
import type {
  ForgotPasswordBody,
  VerifyForgotPasswordOtpBody,
  ResetPasswordBody,
  ChangePasswordBody,
} from "./auth.schema";
import type { SendRegisterOtpUseCase } from "../application/use-cases/send-register-otp.use-case";

const DEFAULT_ACCESS_EXPIRY = 900;
const DEFAULT_REFRESH_EXPIRY = 604800;

export class TenantAuthController {
  constructor(
    private readonly registerTenantOwnerUseCase: RegisterTenantOwnerUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly selectTenantUseCase: SelectTenantUseCase,
    private readonly refreshTokensUseCase: RefreshTokensUseCase,
    private readonly getProfileUseCase: GetProfileUseCase,
    private readonly createInviteUseCase: CreateInviteUseCase,
    private readonly acceptInviteUseCase: AcceptInviteUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly verifyForgotPasswordOtpUseCase: VerifyForgotPasswordOtpUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly sendRegisterOtpUseCase: SendRegisterOtpUseCase,
  ) {}

  sendRegisterOtp = async (
    req: Request<unknown, unknown, SendRegisterOtpBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const output = await this.sendRegisterOtpUseCase.execute(req.body);
      sendSuccess(res, output, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  };

  register = async (
    req: Request<unknown, unknown, RegisterTenantOwnerBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const output = await this.registerTenantOwnerUseCase.execute(req.body);
      this.setTokenCookies(
        res,
        output.accessToken,
        output.refreshToken,
        output.accessTokenExpiresIn,
        output.refreshTokenExpiresIn,
      );
      sendSuccess(
        res,
        AuthMapper.toRegisterResponse(output),
        HttpStatus.CREATED,
      );
    } catch (err) {
      next(err);
    }
  };

  login = async (
    req: Request<unknown, unknown, LoginBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const output = await this.loginUseCase.execute(req.body);
      if (output.accessToken && output.refreshToken) {
        this.setTokenCookies(
          res,
          output.accessToken,
          output.refreshToken,
          output.accessTokenExpiresIn ?? DEFAULT_ACCESS_EXPIRY,
          output.refreshTokenExpiresIn ?? DEFAULT_REFRESH_EXPIRY,
        );
      }
      sendSuccess(res, AuthMapper.toLoginResponse(output), HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  };

  selectTenant = async (
    req: Request<unknown, unknown, SelectTenantBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authReq = req as AuthRequest;
      const output = await this.selectTenantUseCase.execute({
        userId: authReq.user.userId,
        tenantId: req.body.tenantId,
      });
      this.setTokenCookies(
        res,
        output.accessToken,
        output.refreshToken,
        output.accessTokenExpiresIn,
        output.refreshTokenExpiresIn,
      );
      sendSuccess(
        res,
        AuthMapper.toSelectTenantResponse(output),
        HttpStatus.OK,
      );
    } catch (err) {
      next(err);
    }
  };

  refresh = async (
    req: Request<unknown, unknown, Partial<RefreshTokensBody>>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      let refreshToken = req.body.refreshToken;
      if (!refreshToken && req.cookies?.[COOKIE_REFRESH_TOKEN]) {
        refreshToken = req.cookies[COOKIE_REFRESH_TOKEN] as string;
      }
      if (!refreshToken) {
        throw new UnauthorizedError(AuthMessages.REFRESH_TOKEN_INVALID);
      }
      const output = await this.refreshTokensUseCase.execute({ refreshToken });
      this.setTokenCookies(
        res,
        output.accessToken,
        output.refreshToken,
        output.accessTokenExpiresIn,
        output.refreshTokenExpiresIn,
      );
      sendSuccess(res, AuthMapper.toRefreshResponse(), HttpStatus.OK);
    } catch (err) {
      this.clearTokenCookies(res);
      next(err);
    }
  };

  profile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authReq = req as AuthRequest;
      const output = await this.getProfileUseCase.execute(authReq.user.userId);
      sendSuccess(res, AuthMapper.toProfileResponse(output), HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  };

  createInvite = async (
    req: Request<unknown, unknown, CreateInviteBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const context = (req as AuthRequest).user as TenantAuthContext;
      const output = this.createInviteUseCase.execute({
        tenantId: context.tenantId,
        email: req.body.email,
        role: req.body.role,
        inviterId: context.userId,
      });
      sendSuccess(res, AuthMapper.toInviteResponse(output), HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  };

  acceptInvite = async (
    req: Request<unknown, unknown, AcceptInviteBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const output = await this.acceptInviteUseCase.execute(req.body);
      this.setTokenCookies(
        res,
        output.accessToken,
        output.refreshToken,
        output.accessTokenExpiresIn,
        output.refreshTokenExpiresIn,
      );
      sendSuccess(
        res,
        AuthMapper.toAcceptInviteResponse(output),
        HttpStatus.CREATED,
      );
    } catch (err) {
      next(err);
    }
  };

  logout = async (
    req: Request<unknown, unknown, Partial<LogoutBody>>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      let refreshToken = req.body.refreshToken;
      if (!refreshToken && req.cookies?.[COOKIE_REFRESH_TOKEN]) {
        refreshToken = req.cookies[COOKIE_REFRESH_TOKEN] as string;
      }
      if (refreshToken) {
        await this.logoutUseCase.execute({ refreshToken });
      }
      this.clearTokenCookies(res);
      sendSuccess(res, { message: AuthMessages.LOGOUT_SUCCESS }, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  };

  forgotPassword = async (
    req: Request<unknown, unknown, ForgotPasswordBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const output = await this.forgotPasswordUseCase.execute(req.body);
      sendSuccess(res, output, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  };

  verifyForgotPasswordOtp = async (
    req: Request<unknown, unknown, VerifyForgotPasswordOtpBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const output = await this.verifyForgotPasswordOtpUseCase.execute(
        req.body,
      );
      sendSuccess(res, output, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  };

  resetPassword = async (
    req: Request<unknown, unknown, ResetPasswordBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const output = await this.resetPasswordUseCase.execute(req.body);
      // Force user back to login: clear any existing cookies
      this.clearTokenCookies(res);
      sendSuccess(res, output, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  };

  changePassword = async (
    req: Request<unknown, unknown, ChangePasswordBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authReq = req as AuthRequest;
      const output = await this.changePasswordUseCase.execute({
        userId: authReq.user.userId,
        oldPassword: req.body.oldPassword,
        newPassword: req.body.newPassword,
      });
      // Force re-login on all devices
      this.clearTokenCookies(res);
      sendSuccess(res, output, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  };

  // ── Cookie Helpers ──────────────────────────────────────────────────────

  private setTokenCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
    accessExpiry: number,
    refreshExpiry: number,
  ): void {
    const isProduction = env.nodeEnv === "production";
    const sameSite = getCookieSameSite(isProduction);

    res.cookie(COOKIE_ACCESS_TOKEN, accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite,
      maxAge: accessExpiry * 1000,
      path: "/",
    });

    res.cookie(COOKIE_REFRESH_TOKEN, refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite,
      maxAge: refreshExpiry * 1000,
      path: "/",
    });
  }

  private clearTokenCookies(res: Response): void {
    const isProduction = env.nodeEnv === "production";
    const sameSite = getCookieSameSite(isProduction);
    const opts = { httpOnly: true, secure: isProduction, sameSite, path: "/" };

    res.clearCookie(COOKIE_ACCESS_TOKEN, opts);
    res.clearCookie(COOKIE_REFRESH_TOKEN, opts);
  }
}
