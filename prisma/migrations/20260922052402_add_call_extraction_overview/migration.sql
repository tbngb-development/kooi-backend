-- CreateTable
CREATE TABLE "CallExtractionInsight" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "batchId" TEXT,
    "dispositionId" TEXT NOT NULL,
    "dispositionSlug" TEXT NOT NULL,
    "dispositionName" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "subjectiveValue" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallExtractionInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallExtractionInsight_tenantId_campaignId_dispositionId_idx" ON "CallExtractionInsight"("tenantId", "campaignId", "dispositionId");

-- CreateIndex
CREATE INDEX "CallExtractionInsight_tenantId_campaignId_dispositionId_nor_idx" ON "CallExtractionInsight"("tenantId", "campaignId", "dispositionId", "normalizedValue");

-- CreateIndex
CREATE INDEX "CallExtractionInsight_callId_idx" ON "CallExtractionInsight"("callId");

-- CreateIndex
CREATE INDEX "CallExtractionInsight_batchId_idx" ON "CallExtractionInsight"("batchId");

-- AddForeignKey
ALTER TABLE "CallExtractionInsight" ADD CONSTRAINT "CallExtractionInsight_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallExtractionInsight" ADD CONSTRAINT "CallExtractionInsight_dispositionId_fkey" FOREIGN KEY ("dispositionId") REFERENCES "ExtractionDisposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
