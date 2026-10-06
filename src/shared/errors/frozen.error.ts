import { AppError } from "./app.error";

/**
 * Thrown when a tenant attempts a mutation while their workspace
 * is being migrated to a new Bolna API key / workspace.
 *
 * HTTP 423 Locked — the resource is temporarily frozen.
 */
export class TenantWorkspaceFrozenError extends AppError {
  constructor(tenantId: string) {
    super(
      423,
      "Tenant workspace is currently being migrated. All campaign, batch, and call operations are temporarily paused. Please wait for the migration to complete.",
      "TENANT_WORKSPACE_FROZEN",
    );
  }
}