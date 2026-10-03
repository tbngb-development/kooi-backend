-- DropIndex
DROP INDEX "Lead_campaignId_idx";

-- DropIndex
DROP INDEX "Lead_tenantId_idx";

-- DropIndex
DROP INDEX "LeadBatch_campaignId_idx";

-- DropIndex
DROP INDEX "LeadBatch_tenantId_idx";

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LeadBatch" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Lead_tenantId_isDeleted_idx" ON "Lead"("tenantId", "isDeleted");

-- CreateIndex
CREATE INDEX "Lead_campaignId_isDeleted_idx" ON "Lead"("campaignId", "isDeleted");

-- CreateIndex
CREATE INDEX "LeadBatch_tenantId_isDeleted_idx" ON "LeadBatch"("tenantId", "isDeleted");

-- CreateIndex
CREATE INDEX "LeadBatch_campaignId_isDeleted_idx" ON "LeadBatch"("campaignId", "isDeleted");
