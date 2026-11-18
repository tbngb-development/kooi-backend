/**
 * Minimal read-only lookup so the batches module can include a tenant display
 * name in internal operational notifications without depending on the full
 * TenantRepository from the tenants module.
 */
export interface TenantNameRepository {
  getNameById(tenantId: string): Promise<string | null>;
}
