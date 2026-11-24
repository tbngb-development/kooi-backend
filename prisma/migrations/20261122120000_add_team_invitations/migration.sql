-- Team membership invitations (distinct from the platform-admin TenantInvite).
-- Safe on a database with existing data: additive only, no backfill required.

CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "sendCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
CREATE INDEX "Invitation_tenantId_status_idx" ON "Invitation"("tenantId", "status");
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- A tenant may have at most one non-expired PENDING invite per email address.
-- lower(email) makes the guard case-insensitive. Historical invitations are
-- unaffected because the table starts empty.
CREATE UNIQUE INDEX "Invitation_tenant_email_pending_key"
    ON "Invitation" ("tenantId", lower("email"))
    WHERE status = 'PENDING';

ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Manual rollback (Prisma does not generate down migrations):
-- DROP TABLE "Invitation";
-- DROP TYPE "InvitationStatus";
