/**
 * Cross-cutting logging abstraction.
 *
 * Lives outside any module and has ZERO dependency on Winston or any
 * logging library.  Use-cases, services, and middleware depend on this
 * interface only — the concrete implementation is injected via the
 * existing manual-DI container.
 */

export interface LogContext {
  /** Auto-injected by the request-logger middleware via AsyncLocalStorage. */
  requestId?: string;

  /** Tenant scope — present on all tenant-scoped operations. */
  tenantId?: string;

  /** Authenticated user. */
  userId?: string;

  /** Domain identifiers — include when relevant. */
  campaignId?: string;
  batchId?: string;
  jobId?: string;
  callId?: string;
  orderId?: string;
  paymentId?: string;

  /** Module tag — set via `logger.child({ module: "auth" })`. */
  module?: string;

  /** Free-form action label (e.g. "login", "debit", "webhook.received"). */
  action?: string;

  /** Open-ended for any additional structured metadata. */
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;

  /**
   * Log an error with an optional Error object and structured context.
   *
   * - When `error` is an `Error` instance the implementation MUST
   *   preserve the stack trace in the output.
   * - When `error` is `undefined` the call behaves like a normal
   *   level-log with context only.
   */
  error(message: string, error?: unknown, context?: LogContext): void;

  /**
   * Return a new Logger that merges `defaultContext` into every
   * subsequent log call.  Used to tag a module or subsystem:
   *
   *   const log = logger.child({ module: "wallet" });
   *   log.info("Debit succeeded", { tenantId });
   *   // → { module: "wallet", tenantId, … }
   */
  child(defaultContext: LogContext): Logger;
}