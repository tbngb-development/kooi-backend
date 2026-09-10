/*
  Warnings:

  - You are about to drop the column `features` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `lowBalanceAlertSent` on the `Wallet` table. All the data in the column will be lost.
  - You are about to drop the column `lowBalanceThreshold` on the `Wallet` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('STANDARD', 'VOLUME', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CallingChannel" AS ENUM ('SHARED', 'DEDICATED', 'DEDICATED_WITH_NUMBER');

-- CreateEnum
CREATE TYPE "DashboardTier" AS ENUM ('BASIC', 'STANDARD', 'ADVANCED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AgentCapability" AS ENUM ('BASIC', 'BASIC_KNOWLEDGE', 'ADVANCED_KNOWLEDGE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "IntegrationTier" AS ENUM ('NONE', 'BASIC', 'API_SELECTED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SupportTier" AS ENUM ('STANDARD', 'PRIORITY', 'SLA');

-- AlterTable
ALTER TABLE "Plan" DROP COLUMN "features",
ADD COLUMN     "agentCapability" "AgentCapability" NOT NULL DEFAULT 'BASIC',
ADD COLUMN     "brochureUpload" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "callingChannel" "CallingChannel" NOT NULL DEFAULT 'SHARED',
ADD COLUMN     "dashboardTier" "DashboardTier" NOT NULL DEFAULT 'BASIC',
ADD COLUMN     "integrations" "IntegrationTier" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "lowBalanceThreshold" INTEGER NOT NULL DEFAULT 10000,
ADD COLUMN     "maxAgents" INTEGER,
ADD COLUMN     "maxTeamMembers" INTEGER,
ADD COLUMN     "onboardingFeeOriginal" INTEGER,
ADD COLUMN     "pricingModel" "PricingModel" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "supportTier" "SupportTier" NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "Wallet" DROP COLUMN "lowBalanceAlertSent",
DROP COLUMN "lowBalanceThreshold";
