-- CreateEnum
CREATE TYPE "CallSource" AS ENUM ('CAMPAIGN', 'INBOUND', 'QUICK_DIAL');

-- CreateEnum
CREATE TYPE "InboundNumberStatus" AS ENUM ('AVAILABLE', 'ACTIVE', 'SUSPENDED', 'RELEASED');

-- CreateEnum
CREATE TYPE "ProviderSyncStatus" AS ENUM ('SYNCED', 'PENDING_SYNC', 'FAILED');

-- CreateEnum
CREATE TYPE "RentalBillingStatus" AS ENUM ('CHARGED', 'FAILED', 'WAIVED');

-- CreateEnum
CREATE TYPE "QuickDialStatus" AS ENUM ('PENDING', 'INITIATED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "WalletTxSourceType" ADD VALUE 'NUMBER_RENTAL';

-- DropForeignKey
ALTER TABLE "Call" DROP CONSTRAINT "Call_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "Call" DROP CONSTRAINT "Call_leadId_fkey";

-- DropForeignKey
ALTER TABLE "Lead" DROP CONSTRAINT "Lead_campaignId_fkey";

-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "assistantId" TEXT,
ADD COLUMN     "inboundNumberId" TEXT,
ADD COLUMN     "quickDialJobId" TEXT,
ADD COLUMN     "source" "CallSource" NOT NULL DEFAULT 'CAMPAIGN',
ALTER COLUMN "campaignId" DROP NOT NULL,
ALTER COLUMN "leadId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Lead" ALTER COLUMN "campaignId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "InboundNumber" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "bolnaPhoneNumberId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'bolna',
    "status" "InboundNumberStatus" NOT NULL DEFAULT 'AVAILABLE',
    "providerSyncStatus" "ProviderSyncStatus" NOT NULL DEFAULT 'SYNCED',
    "providerSyncError" TEXT,
    "monthlyRentalPaisa" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT,
    "assistantId" TEXT,
    "bolnaApiKeyId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "lastBilledAt" TIMESTAMP(3),
    "nextBillingAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundNumberRentalHistory" (
    "id" TEXT NOT NULL,
    "inboundNumberId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amountPaisa" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "RentalBillingStatus" NOT NULL DEFAULT 'CHARGED',
    "walletTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundNumberRentalHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickDialJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assistantId" TEXT NOT NULL,
    "leadId" TEXT,
    "recipientPhone" TEXT NOT NULL,
    "status" "QuickDialStatus" NOT NULL DEFAULT 'PENDING',
    "bolnaExecutionId" TEXT,
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickDialJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboundNumber_phoneNumber_key" ON "InboundNumber"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InboundNumber_bolnaPhoneNumberId_key" ON "InboundNumber"("bolnaPhoneNumberId");

-- CreateIndex
CREATE INDEX "InboundNumber_tenantId_isDeleted_idx" ON "InboundNumber"("tenantId", "isDeleted");

-- CreateIndex
CREATE INDEX "InboundNumber_assistantId_isDeleted_idx" ON "InboundNumber"("assistantId", "isDeleted");

-- CreateIndex
CREATE INDEX "InboundNumber_status_isDeleted_idx" ON "InboundNumber"("status", "isDeleted");

-- CreateIndex
CREATE INDEX "InboundNumberRentalHistory_inboundNumberId_idx" ON "InboundNumberRentalHistory"("inboundNumberId");

-- CreateIndex
CREATE INDEX "InboundNumberRentalHistory_tenantId_idx" ON "InboundNumberRentalHistory"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "QuickDialJob_bolnaExecutionId_key" ON "QuickDialJob"("bolnaExecutionId");

-- CreateIndex
CREATE INDEX "QuickDialJob_tenantId_createdAt_idx" ON "QuickDialJob"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "QuickDialJob_userId_idx" ON "QuickDialJob"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Call_quickDialJobId_key" ON "Call"("quickDialJobId");

-- CreateIndex
CREATE INDEX "Call_assistantId_isDeleted_idx" ON "Call"("assistantId", "isDeleted");

-- CreateIndex
CREATE INDEX "Call_inboundNumberId_isDeleted_idx" ON "Call"("inboundNumberId", "isDeleted");

-- CreateIndex
CREATE INDEX "Call_source_idx" ON "Call"("source");

-- CreateIndex
CREATE INDEX "Lead_tenantId_phone_idx" ON "Lead"("tenantId", "phone");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_inboundNumberId_fkey" FOREIGN KEY ("inboundNumberId") REFERENCES "InboundNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_quickDialJobId_fkey" FOREIGN KEY ("quickDialJobId") REFERENCES "QuickDialJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundNumber" ADD CONSTRAINT "InboundNumber_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundNumber" ADD CONSTRAINT "InboundNumber_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundNumber" ADD CONSTRAINT "InboundNumber_bolnaApiKeyId_fkey" FOREIGN KEY ("bolnaApiKeyId") REFERENCES "BolnaApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundNumberRentalHistory" ADD CONSTRAINT "InboundNumberRentalHistory_inboundNumberId_fkey" FOREIGN KEY ("inboundNumberId") REFERENCES "InboundNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundNumberRentalHistory" ADD CONSTRAINT "InboundNumberRentalHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickDialJob" ADD CONSTRAINT "QuickDialJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickDialJob" ADD CONSTRAINT "QuickDialJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickDialJob" ADD CONSTRAINT "QuickDialJob_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickDialJob" ADD CONSTRAINT "QuickDialJob_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
