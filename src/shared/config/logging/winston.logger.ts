/**
 * Winston-backed implementation of the shared Logger interface.
 *
 * This is the ONLY file in the entire codebase that imports "winston".
 * Everything else depends on `shared/logging/logger.interface.ts`.
 */

import winston from "winston";
import { env } from "../env";
import { getRequestId } from "./request-context";
import type { Logger, LogContext } from "../../logging/logger.interface";

// ── Sensitive-field redaction ────────────────────────────────────────

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "accesstoken",
  "refreshtoken",
  "otp",
  "secret",
  "apikey",
  "keysecret",
  "keyid",
  "signature",
  "authorization",
  "rawbody",
  "pin",
  "cvv",
  "cardnumber",
]);

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEYS.has(key.toLowerCase())) return "[REDACTED]";

  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Error) &&
    !(value instanceof Date)
  ) {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = redactValue(k, v);
    }
    return result;
  }

  return value;
}

const redactFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    info[key] = redactValue(key, info[key]);
  }
  return info;
});

// ── AsyncLocalStorage requestId injection ────────────────────────────

const requestIdFormat = winston.format((info) => {
  const requestId = getRequestId();
  if (requestId && !info.requestId) {
    info.requestId = requestId;
  }
  return info;
});

// ── Error object extraction ──────────────────────────────────────────

const errorExtractFormat = winston.format((info) => {
  if (info.error instanceof Error) {
    info.errorName = info.error.name;
    info.errorMessage = info.error.message;
    info.errorStack = info.error.stack;

    // Surface AppError / domain-error properties when present
    const err = info.error as unknown as Record<string, unknown>;
    if (typeof err.code === "string") info.errorCode = err.code;
    if (typeof err.statusCode === "number")
      info.errorStatusCode = err.statusCode;

    delete info.error; // remove the raw Error object from JSON output
  }
  return info;
});

// ── Format pipelines ─────────────────────────────────────────────────

function buildDevFormat() {
  return winston.format.combine(
    winston.format.timestamp({ format: "HH:mm:ss.SSS" }),
    requestIdFormat(),
    redactFormat(),
    errorExtractFormat(),
    winston.format.colorize(),
    winston.format.printf(
      ({ timestamp, level, message, requestId, module, ...rest }) => {
        const rid = requestId ? ` [${requestId}]` : "";
        const mod = module ? ` [${module}]` : "";

        // Separate error fields from other metadata for readability
        const { errorName, errorMessage, errorStack, ...meta } = rest;
        const metaStr =
          Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
        const errStr = errorStack
          ? `\n  ${errorName}: ${errorMessage}\n${errorStack}`
          : "";

        return `${timestamp} ${level}${rid}${mod} ${message}${metaStr}${errStr}`;
      },
    ),
  );
}

function buildProdFormat() {
  return winston.format.combine(
    winston.format.timestamp(),
    requestIdFormat(),
    redactFormat(),
    errorExtractFormat(),
    winston.format.json(),
  );
}

// ── Logger wrapper ───────────────────────────────────────────────────

class WinstonLogger implements Logger {
  constructor(
    private readonly winston: winston.Logger,
    private readonly defaults: LogContext = {},
  ) {}

  debug(message: string, context?: LogContext): void {
    this.winston.debug(message, { ...this.defaults, ...context });
  }

  info(message: string, context?: LogContext): void {
    this.winston.info(message, { ...this.defaults, ...context });
  }

  warn(message: string, context?: LogContext): void {
    this.winston.warn(message, { ...this.defaults, ...context });
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    const meta: Record<string, unknown> = {
      ...this.defaults,
      ...context,
    };
    if (error !== undefined) {
      meta.error = error;
    }
    this.winston.error(message, meta);
  }

  child(defaultContext: LogContext): Logger {
    return new WinstonLogger(this.winston, {
      ...this.defaults,
      ...defaultContext,
    });
  }
}

// ── Factory ──────────────────────────────────────────────────────────

export function createLogger(): Logger {
  const isProduction = env.nodeEnv === "production";

  const winstonInstance = winston.createLogger({
    level: env.logLevel,
    format: isProduction ? buildProdFormat() : buildDevFormat(),
    transports: [
      new winston.transports.Console({
        stderrLevels: ["error", "warn"],
      }),
    ],
    // Prevent Winston from crashing the process on transport errors
    exitOnError: false,
  });

  return new WinstonLogger(winstonInstance);
}
