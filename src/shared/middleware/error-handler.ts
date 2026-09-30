import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/app.error";
import { ValidationError } from "../errors/validation.error";
import { sendError } from "../utils/response";
import { HttpStatus } from "../constants/http-status";
import { GeneralMessages } from "../constants/messages";
import type { Logger } from "../logging/logger.interface";

/**
 * Creates the global Express error-handling middleware.
 *
 * Logging strategy:
 *  - 4xx (ValidationError, AppError) → warn  (expected client errors, passed in context)
 *  - 5xx (unexpected)                → error (needs investigation, passed as error param)
 */
export function createErrorHandler(logger: Logger) {
  return (
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction,
  ): void => {
    const context = { method: req.method, path: req.path };

    if (err instanceof ValidationError) {
      // Pass the validation error object inside the context metadata
      logger.warn("Validation error", { ...context, error: err });
      sendError(res, err.statusCode, err.message, err.code, err.details);
      return;
    }

    if (err instanceof AppError) {
      // Pass the application domain error object inside the context metadata
      logger.warn("Application error", { ...context, error: err });
      sendError(res, err.statusCode, err.message, err.code);
      return;
    }

    // Unexpected 5xx errors: Use logger.error signature to get priority logging and alerting alerts
    logger.error("Unhandled error", err, context);
    sendError(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      GeneralMessages.INTERNAL_ERROR,
      "INTERNAL_ERROR",
    );
  };
}
