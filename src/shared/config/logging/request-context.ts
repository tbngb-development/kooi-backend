/**
 * Propagates a per-request `requestId` through the entire async call
 * stack — middleware → controller → use-case → repository → external
 * provider — without changing any function signatures.
 *
 * Uses Node's built-in AsyncLocalStorage (zero dependencies).
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Returns the current request's correlation ID, or `undefined` when
 * called outside a request lifecycle (e.g. during server bootstrap
 * or inside a cron job that was not triggered by an HTTP request).
 */
export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
