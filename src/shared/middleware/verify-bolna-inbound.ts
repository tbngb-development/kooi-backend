import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "../constants/http-status";
import { env } from "../config/env";

/**
 * Authenticates inbound requests from Bolna using a platform-level Bearer token.
 * Configured in Bolna's Inbound Calling settings under "Use your internal APIs".
 */
export function verifyBolnaInbound(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const expectedToken = env.bolna.bolnaInboundAuthToken;

  if (!expectedToken) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: "Inbound auth token is not configured on the server.",
    });
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(HttpStatus.UNAUTHORIZED).json({
      error:
        "Missing or invalid Authorization header. Expected: Bearer <token>",
    });
    return;
  }

  const token = authHeader.slice(7);

  if (token !== expectedToken) {
    res.status(HttpStatus.FORBIDDEN).json({
      error: "Invalid authentication token.",
    });
    return;
  }

  next();
}
