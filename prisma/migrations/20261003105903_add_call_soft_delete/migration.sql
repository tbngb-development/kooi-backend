-- DropIndex
DROP INDEX "Call_campaignId_idx";

-- DropIndex
DROP INDEX "Call_tenantId_idx";

-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Call_tenantId_isDeleted_idx" ON "Call"("tenantId", "isDeleted");

-- CreateIndex
CREATE INDEX "Call_campaignId_isDeleted_idx" ON "Call"("campaignId", "isDeleted");
