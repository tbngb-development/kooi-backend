-- CreateTable
CREATE TABLE "CallExtractionOverview" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "batchId" TEXT,
    "dispositionId" TEXT NOT NULL,
    "dispositionSlug" TEXT NOT NULL,
    "dispositionName" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "objectiveValue" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallExtractionOverview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallExtractionOverview_tenantId_campaignId_dispositionId_idx" ON "CallExtractionOverview"("tenantId", "campaignId", "dispositionId");

-- CreateIndex
CREATE INDEX "CallExtractionOverview_tenantId_campaignId_dispositionId_ob_idx" ON "CallExtractionOverview"("tenantId", "campaignId", "dispositionId", "objectiveValue");

-- CreateIndex
CREATE INDEX "CallExtractionOverview_callId_idx" ON "CallExtractionOverview"("callId");

-- CreateIndex
CREATE INDEX "CallExtractionOverview_batchId_idx" ON "CallExtractionOverview"("batchId");

-- AddForeignKey
ALTER TABLE "CallExtractionOverview" ADD CONSTRAINT "CallExtractionOverview_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallExtractionOverview" ADD CONSTRAINT "CallExtractionOverview_dispositionId_fkey" FOREIGN KEY ("dispositionId") REFERENCES "ExtractionDisposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
