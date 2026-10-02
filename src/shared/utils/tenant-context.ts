// src/shared/utils/tenant-context.ts
import { ForbiddenError } from "../errors/forbidden.error";
import { UnauthorizedError } from "../errors/unauthorized.error";
import type { AuthRequest, TenantAuthContext } from "../types";

/**
 * Extracts and guarantees an active, verified tenant context from the authorized request.
 * Throws clean operational errors caught by global handlers if caller is not an active tenant user.
 */
export function getTenantContext(req: unknown): TenantAuthContext {
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    throw new UnauthorizedError("User is not authenticated");
  }
  if (authReq.user.type !== "tenant") {
    throw new ForbiddenError("Active tenant context is required");
  }
  return authReq.user;
}