-- AlterTable
ALTER TABLE "CallExtractionOverview" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "CallExtractionOverview_tenantId_campaignId_dispositionId_so_idx" ON "CallExtractionOverview"("tenantId", "campaignId", "dispositionId", "sortOrder");
