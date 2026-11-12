-- CreateTable
CREATE TABLE "SarvamConfiguration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SarvamConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SarvamConfiguration_tenantId_key" ON "SarvamConfiguration"("tenantId");

-- CreateIndex
CREATE INDEX "SarvamConfiguration_tenantId_idx" ON "SarvamConfiguration"("tenantId");

-- CreateIndex
CREATE INDEX "SarvamConfiguration_isActive_idx" ON "SarvamConfiguration"("isActive");

-- AddForeignKey
ALTER TABLE "SarvamConfiguration" ADD CONSTRAINT "SarvamConfiguration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

