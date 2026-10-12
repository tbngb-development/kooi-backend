import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { createErrorHandler } from "../../../src/shared/middleware/error-handler";
import { ValidationError } from "../../../src/shared/errors/validation.error";
import { NotFoundError } from "../../../src/shared/errors/not-found.error";
import { UnauthorizedError } from "../../../src/shared/errors/unauthorized.error";
import { ConflictError } from "../../../src/shared/errors/conflict.error";
import { HttpStatus } from "../../../src/shared/constants/http-status";
import type { Logger } from "../../../src/shared/logging/logger.interface";

describe("Global Error Handler Middleware (Module 1)", () => {
  const mockLogger: Logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };

  const errorHandler = createErrorHandler(mockLogger);

  function createReqRes() {
    const req = {
      method: "GET",
      path: "/api/v1/test",
    } as Request;

    const res = {
      statusCode: 200,
      jsonData: null as unknown,
      status: vi.fn().mockImplementation(function (code: number) {
        res.statusCode = code;
        return res;
      }),
      json: vi.fn().mockImplementation(function (data: unknown) {
        res.jsonData = data;
        return res;
      }),
    } as unknown as Response & { statusCode: number; jsonData: any };

    const next = vi.fn() as unknown as NextFunction;

    return { req, res, next };
  }

  it("handles ValidationError with details and returns 422 Unprocessable Entity", () => {
    const { req, res, next } = createReqRes();
    const details = [{ field: "phone", message: "Phone is required" }];
    const error = new ValidationError(details);

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.jsonData.success).toBe(false);
    expect(res.jsonData.error).toBe("Validation failed");
    expect(res.jsonData.code).toBe("VALIDATION_ERROR");
    expect(res.jsonData.details).toEqual(details);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("handles NotFoundError and returns 404", () => {
    const { req, res, next } = createReqRes();
    const error = new NotFoundError("Campaign");

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(res.jsonData.success).toBe(false);
    expect(res.jsonData.error).toBe("Campaign not found");
  });

  it("handles UnauthorizedError and returns 401", () => {
    const { req, res, next } = createReqRes();
    const error = new UnauthorizedError("Invalid or expired session");

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(res.jsonData.success).toBe(false);
    expect(res.jsonData.error).toBe("Invalid or expired session");
  });

  it("handles ConflictError and returns 409", () => {
    const { req, res, next } = createReqRes();
    const error = new ConflictError("Email already registered");

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(res.jsonData.success).toBe(false);
    expect(res.jsonData.error).toBe("Email already registered");
  });

  it("handles unexpected generic Error and returns 500", () => {
    const { req, res, next } = createReqRes();
    const error = new Error("Database network dropped unexpectedly");

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.jsonData.success).toBe(false);
    expect(res.jsonData.code).toBe("INTERNAL_ERROR");
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
