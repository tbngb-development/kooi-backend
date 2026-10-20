    -- CreateEnum
    CREATE TYPE "LeadType" AS ENUM ('OUTBOUND', 'INBOUND');

    -- CreateEnum
    CREATE TYPE "LeadSource" AS ENUM ('CAMPAIGN', 'INBOUND', 'QUICK_DIAL');

    -- CreateEnum
    CREATE TYPE "CallType" AS ENUM ('OUTBOUND', 'INBOUND');

    -- CreateEnum
    CREATE TYPE "CallSource" AS ENUM ('CAMPAIGN', 'INBOUND', 'QUICK_DIAL');

    -- CreateEnum
    CREATE TYPE "TelephonyProvider" AS ENUM ('BOLNA', 'TWILIO', 'PLIVO', 'EXOTEL', 'VONAGE', 'OTHER');

    -- CreateEnum
    CREATE TYPE "PhoneStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'RELEASED');

    -- CreateEnum
    CREATE TYPE "PhoneCapability" AS ENUM ('INBOUND', 'OUTBOUND', 'BOTH');

    -- DropForeignKey
    ALTER TABLE "Call" DROP CONSTRAINT "Call_campaignId_fkey";

    -- DropForeignKey
    ALTER TABLE "Lead" DROP CONSTRAINT "Lead_campaignId_fkey";

    -- AlterTable
    ALTER TABLE "Call" ADD COLUMN     "agentNumber" TEXT,
    ADD COLUMN     "assistantId" TEXT,
    ADD COLUMN     "source" "CallSource" NOT NULL DEFAULT 'CAMPAIGN',
    ADD COLUMN     "type" "CallType" NOT NULL DEFAULT 'OUTBOUND',
    ALTER COLUMN "campaignId" DROP NOT NULL;

    -- AlterTable
    ALTER TABLE "CallExtractionInsight" ALTER COLUMN "campaignId" DROP NOT NULL;

    -- AlterTable
    ALTER TABLE "CallExtractionOverview" ALTER COLUMN "campaignId" DROP NOT NULL;

    -- AlterTable
    ALTER TABLE "Campaign" DROP COLUMN "calledLeads",
    DROP COLUMN "completedLeads",
    DROP COLUMN "failedLeads",
    DROP COLUMN "totalLeads";

    -- AlterTable
    ALTER TABLE "ClassifierCallResult" ALTER COLUMN "campaignId" DROP NOT NULL;

    -- AlterTable
    ALTER TABLE "ClassifierDisposition" ADD COLUMN     "isMetric" BOOLEAN NOT NULL DEFAULT false;

    -- AlterTable
    ALTER TABLE "Lead" ADD COLUMN     "assistantId" TEXT,
    ADD COLUMN     "source" "LeadSource" NOT NULL DEFAULT 'CAMPAIGN',
    ADD COLUMN     "type" "LeadType" NOT NULL DEFAULT 'OUTBOUND',
    ALTER COLUMN "campaignId" DROP NOT NULL;

    -- AlterTable
    ALTER TABLE "LeadBatch" DROP COLUMN "calledLeads",
    DROP COLUMN "completedLeads",
    DROP COLUMN "failedLeads",
    DROP COLUMN "totalLeads";

    -- CreateTable
    CREATE TABLE "CallMetric" (
        "id" TEXT NOT NULL,
        "callId" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "campaignId" TEXT,
        "batchId" TEXT,
        "classifierDispositionId" TEXT NOT NULL,
        "classifierSlug" TEXT NOT NULL,
        "classifierName" TEXT NOT NULL,
        "metricValue" TEXT NOT NULL,
        "confidence" DOUBLE PRECISION,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "CallMetric_pkey" PRIMARY KEY ("id")
    );

    -- CreateTable
    CREATE TABLE "PhoneNumber" (
        "id" TEXT NOT NULL,
        "phoneNumber" TEXT NOT NULL,
        "friendlyName" TEXT,
        "provider" "TelephonyProvider" NOT NULL DEFAULT 'BOLNA',
        "status" "PhoneStatus" NOT NULL DEFAULT 'ACTIVE',
        "capabilities" "PhoneCapability" NOT NULL DEFAULT 'BOTH',
        "tenantId" TEXT,
        "assistantId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,

        CONSTRAINT "PhoneNumber_pkey" PRIMARY KEY ("id")
    );

    -- CreateIndex
    CREATE INDEX "CallMetric_tenantId_campaignId_classifierDispositionId_idx" ON "CallMetric"("tenantId", "campaignId", "classifierDispositionId");

    -- CreateIndex
    CREATE INDEX "CallMetric_tenantId_campaignId_classifierDispositionId_metr_idx" ON "CallMetric"("tenantId", "campaignId", "classifierDispositionId", "metricValue");

    -- CreateIndex
    CREATE INDEX "CallMetric_callId_idx" ON "CallMetric"("callId");

    -- CreateIndex
    CREATE INDEX "CallMetric_batchId_idx" ON "CallMetric"("batchId");

    -- CreateIndex
    CREATE UNIQUE INDEX "PhoneNumber_phoneNumber_key" ON "PhoneNumber"("phoneNumber");

    -- CreateIndex
    CREATE INDEX "PhoneNumber_phoneNumber_idx" ON "PhoneNumber"("phoneNumber");

    -- CreateIndex
    CREATE INDEX "PhoneNumber_tenantId_idx" ON "PhoneNumber"("tenantId");

    -- CreateIndex
    CREATE INDEX "PhoneNumber_assistantId_idx" ON "PhoneNumber"("assistantId");

    -- CreateIndex
    CREATE INDEX "PhoneNumber_status_idx" ON "PhoneNumber"("status");

    -- CreateIndex
    CREATE INDEX "Call_campaignId_isDeleted_status_idx" ON "Call"("campaignId", "isDeleted", "status");

    -- CreateIndex
    CREATE INDEX "Call_assistantId_isDeleted_idx" ON "Call"("assistantId", "isDeleted");

    -- CreateIndex
    CREATE INDEX "Call_type_source_idx" ON "Call"("type", "source");

    -- CreateIndex
    CREATE INDEX "Call_agentNumber_idx" ON "Call"("agentNumber");

    -- CreateIndex
    CREATE INDEX "Call_batchId_isDeleted_idx" ON "Call"("batchId", "isDeleted");

    -- CreateIndex
    CREATE INDEX "Call_batchId_isDeleted_status_idx" ON "Call"("batchId", "isDeleted", "status");

    -- CreateIndex
    CREATE INDEX "ClassifierDisposition_isMetric_idx" ON "ClassifierDisposition"("isMetric");

    -- CreateIndex
    CREATE INDEX "Lead_assistantId_isDeleted_idx" ON "Lead"("assistantId", "isDeleted");

    -- CreateIndex
    CREATE INDEX "Lead_type_source_idx" ON "Lead"("type", "source");

    -- CreateIndex
    CREATE INDEX "Lead_batchId_isDeleted_idx" ON "Lead"("batchId", "isDeleted");

    -- AddForeignKey
    ALTER TABLE "Lead" ADD CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "Call" ADD CONSTRAINT "Call_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "Call" ADD CONSTRAINT "Call_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "CallMetric" ADD CONSTRAINT "CallMetric_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "CallMetric" ADD CONSTRAINT "CallMetric_classifierDispositionId_fkey" FOREIGN KEY ("classifierDispositionId") REFERENCES "ClassifierDisposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "PhoneNumber" ADD CONSTRAINT "PhoneNumber_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "PhoneNumber" ADD CONSTRAINT "PhoneNumber_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
