/**
 * Express middleware that:
 *  1. Generates (or reuses) a correlation `requestId`.
 *  2. Enters an AsyncLocalStorage context so every downstream log
 *     automatically includes the requestId.
 *  3. Logs request start and response completion with duration.
 *
 * Mount this ONCE, as early as possible in the middleware chain.
 */

import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { Logger } from "../logging/logger.interface";
import { requestContext } from "../config/logging/request-context";

export function createRequestLogger(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Reuse upstream requestId (e.g. from a reverse proxy) or generate one
    const requestId = (req.headers["x-request-id"] as string) || randomUUID();

    res.setHeader("x-request-id", requestId);

    requestContext.run({ requestId }, () => {
      const start = process.hrtime.bigint();

      logger.debug("Request started", {
        method: req.method,
        path: req.path,
      });

      res.on("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        const level =
          res.statusCode >= 500
            ? "error"
            : res.statusCode >= 400
              ? "warn"
              : "info";

        // Extract identity from the authenticated user if available
        const user = (req as Request & { user?: Record<string, unknown> }).user;

        logger[level]("Request completed", {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Math.round(durationMs),
          ...(user?.tenantId ? { tenantId: String(user.tenantId) } : {}),
          ...(user?.userId ? { userId: String(user.userId) } : {}),
        });
      });

      next();
    });
  };
}
