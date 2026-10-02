import type { Request } from "express";

/**
 * Safely extracts a single string param from Express 5 req.params.
 * Express 5 types params as `string | string[]`; route-defined params
 * like `/:id` always resolve to a single string.
 */
export function param(req: Request, key: string): string {
  const value = req.params[key];
  if (Array.isArray(value)) return value[0];
  if (!value) throw new Error(`Missing route param: ${key}`);
  return value;
}
