-- U-03: durable singleton low-balance incident state.
-- One row per tenant, guarded by a derived idempotency key so duplicate
-- webhooks / retries / multiple app instances cannot create duplicate incidents.

CREATE TYPE "WalletIncidentStatus" AS ENUM ('OPEN', 'BLOCKED', 'RESOLVED');

CREATE TABLE "WalletIncidentState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "state" "WalletIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "triggerBalancePaisa" INTEGER NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "warningSentAt" TIMESTAMP(3),
    "enforcementSentAt" TIMESTAMP(3),
    "providerActions" JSONB NOT NULL DEFAULT '[]',
    "idempotencyKey" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletIncidentState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WalletIncidentState_tenantId_key" ON "WalletIncidentState"("tenantId");
CREATE UNIQUE INDEX "WalletIncidentState_idempotencyKey_key" ON "WalletIncidentState"("idempotencyKey");
CREATE INDEX "WalletIncidentState_tenantId_state_idx" ON "WalletIncidentState"("tenantId", "state");

ALTER TABLE "WalletIncidentState" ADD CONSTRAINT "WalletIncidentState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
