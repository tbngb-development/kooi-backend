import type { Response } from "express";
import type { ApiResponse } from "../types";
import { HttpStatus } from "../constants/http-status";

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = HttpStatus.OK,
  message?: string,
): void {
  const body: ApiResponse<T> = {
    success: true,
    ...(message && { message }),
    data,
  };
  res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  code?: string,
  details?: Array<{ field: string; message: string }>,
): void {
  const body: ApiResponse = {
    success: false,
    error: message,
    ...(code && { code }),
    ...(details && { details }),
  };
  res.status(statusCode).json(body);
}
