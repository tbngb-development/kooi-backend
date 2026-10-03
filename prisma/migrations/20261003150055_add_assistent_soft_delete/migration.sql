-- AlterTable
ALTER TABLE "Assistant" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Assistant_tenantId_isDeleted_idx" ON "Assistant"("tenantId", "isDeleted");
