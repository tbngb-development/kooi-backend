-- AlterTable
ALTER TABLE "SarvamConfiguration" RENAME TO "SarvamApiKey";

-- RenameForeignKey
ALTER TABLE "SarvamApiKey" RENAME CONSTRAINT "SarvamConfiguration_tenantId_fkey" TO "SarvamApiKey_tenantId_fkey";

-- RenamePrimaryKey
ALTER TABLE "SarvamApiKey" RENAME CONSTRAINT "SarvamConfiguration_pkey" TO "SarvamApiKey_pkey";

-- RenameIndex
ALTER INDEX "SarvamConfiguration_tenantId_key" RENAME TO "SarvamApiKey_tenantId_key";
ALTER INDEX "SarvamConfiguration_tenantId_idx" RENAME TO "SarvamApiKey_tenantId_idx";
ALTER INDEX "SarvamConfiguration_isActive_idx" RENAME TO "SarvamApiKey_isActive_idx";

