import type { Request } from "express";
import type { TenantRole } from "@prisma/client";

// ── Auth Context (attached to req.user by middleware) ──────────────────────

export interface TenantAuthContext {
  type: "tenant";
  userId: string;
  email: string;
  membershipId: string;
  tenantId: string;
  tenantRole: TenantRole;
  isPlatformAdmin: boolean;
}

export interface AdminAuthContext {
  type: "admin";
  userId: string;
  email: string;
  isPlatformAdmin: true;
}

export interface BaseAuthContext {
  type: "base";
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
}

export type AuthContext =
  | TenantAuthContext
  | AdminAuthContext
  | BaseAuthContext;

export interface AuthRequest extends Request {
  user: AuthContext;
}

// ── Standard API Response ──────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  code?: string;
  details?: Array<{ field: string; message: string }>;
}

// ── Token Payloads ─────────────────────────────────────────────────────────

export interface AccessTokenPayload {
  userId: string;
  membershipId: string | null;
  tenantId: string | null;
  tenantRole: TenantRole | null;
  isPlatformAdmin: boolean;
  type: "tenant" | "admin" | "base";
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
  type: "refresh";
}

export interface InviteTokenPayload {
  tenantId: string;
  role: TenantRole;
  email: string;
  inviterId: string;
  type: "invite";
}

// ── Membership Info (returned in login response) ───────────────────────────

export interface MembershipInfo {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  role: TenantRole;
}
