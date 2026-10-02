-- CreateTable
CREATE TABLE "CallMetric" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "batchId" TEXT,
    "metricKey" TEXT NOT NULL,
    "metricLabel" TEXT NOT NULL,
    "matched" BOOLEAN NOT NULL,
    "actualValue" TEXT NOT NULL,
    "matchValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallMetric_tenantId_campaignId_metricKey_actualValue_idx" ON "CallMetric"("tenantId", "campaignId", "metricKey", "actualValue");

-- CreateIndex
CREATE INDEX "CallMetric_tenantId_campaignId_metricKey_matched_idx" ON "CallMetric"("tenantId", "campaignId", "metricKey", "matched");

-- CreateIndex
CREATE INDEX "CallMetric_callId_idx" ON "CallMetric"("callId");

-- CreateIndex
CREATE INDEX "CallMetric_tenantId_batchId_metricKey_idx" ON "CallMetric"("tenantId", "batchId", "metricKey");

-- AddForeignKey
ALTER TABLE "CallMetric" ADD CONSTRAINT "CallMetric_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
