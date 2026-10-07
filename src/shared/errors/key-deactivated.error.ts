import { AppError } from "./app.error";

/**
 * Thrown when a tenant's assigned Bolna API key has been deactivated
 * by the platform admin. Blocks all mutation operations (423 Locked).
 */
export class TenantKeyDeactivatedError extends AppError {
  constructor() {
    super(
      423,
      "Your workspace API key has been deactivated by the administrator. All campaign, batch, and call operations are paused. Please contact support.",
      "TENANT_KEY_DEACTIVATED",
    );
  }
}
