/*
  Warnings:

  - You are about to drop the column `agentCapability` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `billingIncrementSec` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `billingMinimumSec` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `bonusValidityDays` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `brochureUpload` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `callingChannel` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `dashboardTier` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `includedBalance` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `industryPackLimit` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `integrations` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `lowBalanceThreshold` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `maxActiveCampaigns` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `maxAgents` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `maxLeadsPerBatch` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `maxTeamMembers` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `onboardingFee` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `onboardingFeeOriginal` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `perMinuteRate` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `pricingModel` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `retryAutomation` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `supportTier` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `planId` on the `Recharge` table. All the data in the column will be lost.
  - The `status` column on the `TenantPlan` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `balance` on the `Wallet` table. All the data in the column will be lost.
  - You are about to drop the column `balanceAfter` on the `WalletTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `referenceId` on the `WalletTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `referenceType` on the `WalletTransaction` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[walletId,idempotencyKey]` on the table `WalletTransaction` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `planVersionId` to the `TenantPlan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `bonusDelta` to the `WalletTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cashBalanceAfter` to the `WalletTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cashDelta` to the `WalletTransaction` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PlanVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TenantPlanStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TenantPlanEventType" AS ENUM ('CREATED', 'ACTIVATED', 'PLAN_CHANGED', 'OVERRIDES_UPDATED', 'BONUS_GRANTED', 'BONUS_EXPIRED', 'CANCELLED', 'EXPIRED', 'REACTIVATED');

-- CreateEnum
CREATE TYPE "WalletTxSourceType" AS ENUM ('RECHARGE', 'CALL', 'PLAN_BONUS', 'BONUS_EXPIRY', 'ADMIN_ADJUSTMENT', 'REFUND');

-- AlterEnum
ALTER TYPE "WalletTxType" ADD VALUE 'BONUS_EXPIRY';

-- DropIndex
DROP INDEX "WalletTransaction_referenceType_referenceId_key";

-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "appliedIncrementSec" INTEGER,
ADD COLUMN     "appliedMinSec" INTEGER,
ADD COLUMN     "appliedRate" INTEGER,
ADD COLUMN     "chargedAmount" INTEGER,
ADD COLUMN     "planVersionId" TEXT;

-- AlterTable
ALTER TABLE "Plan" DROP COLUMN "agentCapability",
DROP COLUMN "billingIncrementSec",
DROP COLUMN "billingMinimumSec",
DROP COLUMN "bonusValidityDays",
DROP COLUMN "brochureUpload",
DROP COLUMN "callingChannel",
DROP COLUMN "dashboardTier",
DROP COLUMN "includedBalance",
DROP COLUMN "industryPackLimit",
DROP COLUMN "integrations",
DROP COLUMN "lowBalanceThreshold",
DROP COLUMN "maxActiveCampaigns",
DROP COLUMN "maxAgents",
DROP COLUMN "maxLeadsPerBatch",
DROP COLUMN "maxTeamMembers",
DROP COLUMN "onboardingFee",
DROP COLUMN "onboardingFeeOriginal",
DROP COLUMN "perMinuteRate",
DROP COLUMN "pricingModel",
DROP COLUMN "retryAutomation",
DROP COLUMN "supportTier",
ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "Recharge" DROP COLUMN "planId",
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'razorpay',
ADD COLUMN     "tenantPlanId" TEXT;

-- AlterTable
ALTER TABLE "TenantPlan" ADD COLUMN     "onboardingFeeOverride" INTEGER,
ADD COLUMN     "perMinuteRateOverride" INTEGER,
ADD COLUMN     "planVersionId" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "TenantPlanStatus" NOT NULL DEFAULT 'PENDING_PAYMENT';

-- AlterTable
ALTER TABLE "Wallet" DROP COLUMN "balance",
ADD COLUMN     "cashBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR';

-- AlterTable
ALTER TABLE "WalletTransaction" DROP COLUMN "balanceAfter",
DROP COLUMN "referenceId",
DROP COLUMN "referenceType",
ADD COLUMN     "bonusDelta" INTEGER NOT NULL,
ADD COLUMN     "cashBalanceAfter" INTEGER NOT NULL,
ADD COLUMN     "cashDelta" INTEGER NOT NULL,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" "WalletTxSourceType";

-- DropEnum
DROP TYPE "PlanStatus";

-- CreateTable
CREATE TABLE "PlanVersion" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PlanVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "pricingModel" "PricingModel" NOT NULL DEFAULT 'STANDARD',
    "onboardingFee" INTEGER NOT NULL,
    "onboardingFeeOriginal" INTEGER,
    "perMinuteRate" INTEGER NOT NULL,
    "billingMinimumSec" INTEGER NOT NULL DEFAULT 30,
    "billingIncrementSec" INTEGER NOT NULL DEFAULT 15,
    "maxActiveCampaigns" INTEGER,
    "maxLeadsPerBatch" INTEGER,
    "maxAgents" INTEGER,
    "maxTeamMembers" INTEGER,
    "retryAutomation" BOOLEAN NOT NULL DEFAULT false,
    "industryPackLimit" INTEGER,
    "callingChannel" "CallingChannel" NOT NULL DEFAULT 'SHARED',
    "brochureUpload" BOOLEAN NOT NULL DEFAULT false,
    "dashboardTier" "DashboardTier" NOT NULL DEFAULT 'BASIC',
    "agentCapability" "AgentCapability" NOT NULL DEFAULT 'BASIC',
    "integrations" "IntegrationTier" NOT NULL DEFAULT 'NONE',
    "supportTier" "SupportTier" NOT NULL DEFAULT 'STANDARD',
    "lowBalanceThreshold" INTEGER NOT NULL DEFAULT 10000,
    "includedBalance" INTEGER NOT NULL DEFAULT 0,
    "bonusValidityDays" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantPlanEvent" (
    "id" TEXT NOT NULL,
    "tenantPlanId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "TenantPlanEventType" NOT NULL,
    "fromPlanVersionId" TEXT,
    "toPlanVersionId" TEXT,
    "metadata" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantPlanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanVersion_status_idx" ON "PlanVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PlanVersion_planId_version_key" ON "PlanVersion"("planId", "version");

-- CreateIndex
CREATE INDEX "TenantPlanEvent_tenantId_createdAt_idx" ON "TenantPlanEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TenantPlanEvent_tenantPlanId_createdAt_idx" ON "TenantPlanEvent"("tenantPlanId", "createdAt");

-- CreateIndex
CREATE INDEX "Recharge_tenantPlanId_idx" ON "Recharge"("tenantPlanId");

-- CreateIndex
CREATE INDEX "TenantPlan_planId_idx" ON "TenantPlan"("planId");

-- CreateIndex
CREATE INDEX "TenantPlan_planVersionId_idx" ON "TenantPlan"("planVersionId");

-- CreateIndex
CREATE INDEX "TenantPlan_status_idx" ON "TenantPlan"("status");

-- CreateIndex
CREATE INDEX "WalletTransaction_sourceType_sourceId_idx" ON "WalletTransaction"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_walletId_idempotencyKey_key" ON "WalletTransaction"("walletId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPlan" ADD CONSTRAINT "TenantPlan_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPlanEvent" ADD CONSTRAINT "TenantPlanEvent_tenantPlanId_fkey" FOREIGN KEY ("tenantPlanId") REFERENCES "TenantPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPlanEvent" ADD CONSTRAINT "TenantPlanEvent_fromPlanVersionId_fkey" FOREIGN KEY ("fromPlanVersionId") REFERENCES "PlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPlanEvent" ADD CONSTRAINT "TenantPlanEvent_toPlanVersionId_fkey" FOREIGN KEY ("toPlanVersionId") REFERENCES "PlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recharge" ADD CONSTRAINT "Recharge_tenantPlanId_fkey" FOREIGN KEY ("tenantPlanId") REFERENCES "TenantPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
