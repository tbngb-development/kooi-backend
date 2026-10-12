import { describe, it, expect, vi } from "vitest";
import type { Response } from "express";
import { sendSuccess, sendError } from "../../../src/shared/utils/response";
import { HttpStatus } from "../../../src/shared/constants/http-status";

describe("API Response Envelopes (Module 1)", () => {
  function createMockResponse() {
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
    };
    return res as unknown as Response & {
      statusCode: number;
      jsonData: unknown;
    };
  }

  describe("sendSuccess", () => {
    it("formats standard successful response", () => {
      const res = createMockResponse();
      const testData = { userId: "user-123", name: "Alice" };

      sendSuccess(res, testData, HttpStatus.OK, "User retrieved");

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "User retrieved",
        data: testData,
      });
    });

    it("defaults to 200 OK when status is omitted", () => {
      const res = createMockResponse();
      sendSuccess(res, { count: 5 });

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.jsonData).toEqual({
        success: true,
        data: { count: 5 },
      });
    });
  });

  describe("sendError", () => {
    it("formats standard error envelope with code and details", () => {
      const res = createMockResponse();
      const details = [{ field: "email", message: "Invalid email" }];

      sendError(
        res,
        HttpStatus.BAD_REQUEST,
        "Validation failed",
        "VALIDATION_ERROR",
        details,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details,
      });
    });

    it("formats error envelope without optional code and details", () => {
      const res = createMockResponse();
      sendError(res, HttpStatus.NOT_FOUND, "Resource not found");

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.jsonData).toEqual({
        success: false,
        error: "Resource not found",
      });
    });
  });
});
