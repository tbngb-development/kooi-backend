import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { VerifyTenantApiKeyUseCase } from "../../modules/tenant-api-keys/application/use-cases/verify-tenant-api-key.use-case";
import { UnauthorizedError } from "../errors/unauthorized.error";
import { ApiKeyMessages } from "../constants/messages";
import { HEADER_API_KEY } from "../constants/headers";
import type { TenantApiKeyAuthContext } from "../types";
import type { Logger } from "../logging/logger.interface";

export class TenantApiKeyAuthMiddleware {
  constructor(
    private readonly verifyTenantApiKeyUseCase: VerifyTenantApiKeyUseCase,
    private readonly logger?: Logger,
  ) {}

  /**
   * Middleware requiring a valid tenant API key passed in the X-API-Key header.
   * Populates req.user with a strongly-typed TenantApiKeyAuthContext.
   */
  authenticate(): RequestHandler {
    return async (
      req: Request,
      _res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        const rawApiKey = req.headers[HEADER_API_KEY];

        if (!rawApiKey || typeof rawApiKey !== "string") {
          this.logger?.warn("API key authentication failed - missing header", {
            action: "tenant_api_key.auth_missing_header",
            path: req.path,
          });
          throw new UnauthorizedError(ApiKeyMessages.KEY_NOT_PROVIDED);
        }

        const trimmedKey = rawApiKey.trim();
        const keyEntity =
          await this.verifyTenantApiKeyUseCase.execute(trimmedKey);

        const context: TenantApiKeyAuthContext = {
          type: "tenant_api_key",
          authType: "api_key",
          apiKeyId: keyEntity.id,
          keyIdentifier: keyEntity.keyIdentifier,
          tenantId: keyEntity.tenantId,
          tenantName: keyEntity.tenant?.name || "",
          userId: keyEntity.createdBy,
          createdByUserId: keyEntity.createdBy,
          isPlatformAdmin: false,
        };

        (req as Request & { user: TenantApiKeyAuthContext }).user = context;
        next();
      } catch (err) {
        next(err);
      }
    };
  }
}
