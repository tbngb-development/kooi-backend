import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";
import { ValidationError } from "../errors/validation.error";

/**
 * Validates request body (POST / PATCH / PUT)
 */
export function validate<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      }));
      return next(new ValidationError(details));
    }

    req.body = result.data;
    next();
  };
}

/**
 * Validates URL query parameters (GET) without breaking Express 5 getter-only req.query
 */
export function validateQuery<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join(".") || "query",
        message: issue.message,
      }));
      return next(new ValidationError(details));
    }

    // Safely define property on req to avoid "Cannot set property query of #<IncomingMessage>"
    Object.defineProperty(req, "query", {
      value: result.data,
      writable: true,
      configurable: true,
      enumerable: true,
    });

    next();
  };
}
