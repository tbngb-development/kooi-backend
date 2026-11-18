/**
 * Minimal read-only interface so the payments module
 * can look up a tenant's email without depending on
 * the full TenantRepository from the tenants module.
 */
export interface TenantEmailRepository {
  getEmailById(tenantId: string): Promise<string | null>;
  /** Display name used in internal operational notifications. */
  getNameById(tenantId: string): Promise<string | null>;
}
