import type { Request, Response, NextFunction } from "express";
import type {
  AdminLoginBody,
  ForgotPasswordBody,
  VerifyForgotPasswordOtpBody,
  ResetPasswordBody,
  ChangePasswordBody,
  LogoutBody,
} from "./auth.schema";
import type { AuthRequest } from "../../../shared/types";
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
import { type LoginUseCase } from "../application/use-cases/login.use-case";
import { type ForgotPasswordUseCase } from "../application/use-cases/forgot-password.use-case";
import { type VerifyForgotPasswordOtpUseCase } from "../application/use-cases/verify-forgot-password-otp.use-case";
import { type ResetPasswordUseCase } from "../application/use-cases/reset-password.use-case";
import { type ChangePasswordUseCase } from "../application/use-cases/change-password.use-case";
import { type LogoutUseCase } from "../application/use-cases/logout.use-case";

const DEFAULT_ACCESS_EXPIRY = 900;
const DEFAULT_REFRESH_EXPIRY = 604800;

export class AdminAuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly verifyForgotPasswordOtpUseCase: VerifyForgotPasswordOtpUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
  ) {}

  login = async (
    req: Request<unknown, unknown, AdminLoginBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const output = await this.loginUseCase.execute(req.body);

      if (!output.user.isPlatformAdmin) {
        throw new UnauthorizedError(AuthMessages.NOT_PLATFORM_ADMIN);
      }

      if (output.accessToken && output.refreshToken) {
        const isProduction = env.nodeEnv === "production";
        const sameSite = getCookieSameSite(isProduction);

        res.cookie(COOKIE_ACCESS_TOKEN, output.accessToken, {
          httpOnly: true,
          secure: isProduction,
          sameSite,
          maxAge: (output.accessTokenExpiresIn ?? DEFAULT_ACCESS_EXPIRY) * 1000,
          path: "/",
        });

        res.cookie(COOKIE_REFRESH_TOKEN, output.refreshToken, {
          httpOnly: true,
          secure: isProduction,
          sameSite,
          maxAge:
            (output.refreshTokenExpiresIn ?? DEFAULT_REFRESH_EXPIRY) * 1000,
          path: "/",
        });
      }

      sendSuccess(res, AuthMapper.toLoginResponse(output), HttpStatus.OK);
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
      this.clearTokenCookies(res);
      sendSuccess(res, output, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  };

  private clearTokenCookies(res: Response): void {
    const isProduction = env.nodeEnv === "production";
    const sameSite = getCookieSameSite(isProduction);
    const opts = { httpOnly: true, secure: isProduction, sameSite, path: "/" };

    res.clearCookie(COOKIE_ACCESS_TOKEN, opts);
    res.clearCookie(COOKIE_REFRESH_TOKEN, opts);
  }
}
