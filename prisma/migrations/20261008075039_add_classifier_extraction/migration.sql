-- CreateEnum
CREATE TYPE "ClassifierQuestionType" AS ENUM ('BOOLEAN', 'CHOICE', 'MULTI_CHOICE');

-- CreateEnum
CREATE TYPE "ClassifierExtractionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "ClassifierDisposition" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "questionType" "ClassifierQuestionType" NOT NULL,
    "objectiveOptions" JSONB NOT NULL,
    "industryPackId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassifierDisposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAgentClassifier" (
    "platformAgentId" TEXT NOT NULL,
    "classifierDispositionId" TEXT NOT NULL,

    CONSTRAINT "PlatformAgentClassifier_pkey" PRIMARY KEY ("platformAgentId","classifierDispositionId")
);

-- CreateTable
CREATE TABLE "ClassifierCallResult" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "batchId" TEXT,
    "status" "ClassifierExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "dispositionCount" INTEGER NOT NULL DEFAULT 0,
    "transcriptLength" INTEGER NOT NULL DEFAULT 0,
    "rawResponse" JSONB,
    "results" JSONB,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "gatewayCost" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "enqueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassifierCallResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassifierDisposition_industryPackId_idx" ON "ClassifierDisposition"("industryPackId");

-- CreateIndex
CREATE INDEX "ClassifierDisposition_isActive_idx" ON "ClassifierDisposition"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ClassifierDisposition_slug_industryPackId_key" ON "ClassifierDisposition"("slug", "industryPackId");

-- CreateIndex
CREATE INDEX "PlatformAgentClassifier_classifierDispositionId_idx" ON "PlatformAgentClassifier"("classifierDispositionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassifierCallResult_callId_key" ON "ClassifierCallResult"("callId");

-- CreateIndex
CREATE INDEX "ClassifierCallResult_tenantId_campaignId_idx" ON "ClassifierCallResult"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "ClassifierCallResult_tenantId_status_idx" ON "ClassifierCallResult"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ClassifierCallResult_callId_idx" ON "ClassifierCallResult"("callId");

-- CreateIndex
CREATE INDEX "ClassifierCallResult_batchId_idx" ON "ClassifierCallResult"("batchId");

-- AddForeignKey
ALTER TABLE "ClassifierDisposition" ADD CONSTRAINT "ClassifierDisposition_industryPackId_fkey" FOREIGN KEY ("industryPackId") REFERENCES "IndustryPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAgentClassifier" ADD CONSTRAINT "PlatformAgentClassifier_platformAgentId_fkey" FOREIGN KEY ("platformAgentId") REFERENCES "PlatformAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAgentClassifier" ADD CONSTRAINT "PlatformAgentClassifier_classifierDispositionId_fkey" FOREIGN KEY ("classifierDispositionId") REFERENCES "ClassifierDisposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassifierCallResult" ADD CONSTRAINT "ClassifierCallResult_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassifierCallResult" ADD CONSTRAINT "ClassifierCallResult_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
