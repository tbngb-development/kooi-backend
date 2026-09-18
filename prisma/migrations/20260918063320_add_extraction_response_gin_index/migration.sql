-- CreateIndex
CREATE INDEX "CallAnalysis_extractionResponse_idx" ON "CallAnalysis" USING GIN ("extractionResponse");
