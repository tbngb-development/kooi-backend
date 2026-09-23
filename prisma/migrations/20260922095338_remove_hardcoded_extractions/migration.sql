/*
  Warnings:

  - You are about to drop the column `budgetRange` on the `CallAnalysis` table. All the data in the column will be lost.
  - You are about to drop the column `customerLocationPref` on the `CallAnalysis` table. All the data in the column will be lost.
  - You are about to drop the column `disposition` on the `CallAnalysis` table. All the data in the column will be lost.
  - You are about to drop the column `doNotCall` on the `CallAnalysis` table. All the data in the column will be lost.
  - You are about to drop the column `extractionDispositionId` on the `CallAnalysis` table. All the data in the column will be lost.
  - You are about to drop the column `extractionResponse` on the `CallAnalysis` table. All the data in the column will be lost.
  - You are about to drop the column `followupSchedule` on the `CallAnalysis` table. All the data in the column will be lost.
  - You are about to drop the column `languageSupportRequired` on the `CallAnalysis` table. All the data in the column will be lost.
  - You are about to drop the column `leadTemperature` on the `CallAnalysis` table. All the data in the column will be lost.
  - You are about to drop the column `locationMatch` on the `CallAnalysis` table. All the data in the column will be lost.
  - You are about to drop the column `preferredConfiguration` on the `CallAnalysis` table. All the data in the column will be lost.
  - You are about to drop the column `preferredContactChannel` on the `CallAnalysis` table. All the data in the column will be lost.
  - You are about to drop the column `preferredNextAction` on the `CallAnalysis` table. All the data in the column will be lost.
  - You are about to drop the column `purchasePurpose` on the `CallAnalysis` table. All the data in the column will be lost.
  - You are about to drop the column `purchaseTimeline` on the `CallAnalysis` table. All the data in the column will be lost.
  - You are about to drop the `CallMetric` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CallAnalysis" DROP CONSTRAINT "CallAnalysis_extractionDispositionId_fkey";

-- DropForeignKey
ALTER TABLE "CallMetric" DROP CONSTRAINT "CallMetric_callId_fkey";

-- DropIndex
DROP INDEX "CallAnalysis_disposition_idx";

-- DropIndex
DROP INDEX "CallAnalysis_extractionDispositionId_idx";

-- DropIndex
DROP INDEX "CallAnalysis_extractionResponse_idx";

-- DropIndex
DROP INDEX "CallAnalysis_leadTemperature_idx";

-- AlterTable
ALTER TABLE "CallAnalysis" DROP COLUMN "budgetRange",
DROP COLUMN "customerLocationPref",
DROP COLUMN "disposition",
DROP COLUMN "doNotCall",
DROP COLUMN "extractionDispositionId",
DROP COLUMN "extractionResponse",
DROP COLUMN "followupSchedule",
DROP COLUMN "languageSupportRequired",
DROP COLUMN "leadTemperature",
DROP COLUMN "locationMatch",
DROP COLUMN "preferredConfiguration",
DROP COLUMN "preferredContactChannel",
DROP COLUMN "preferredNextAction",
DROP COLUMN "purchasePurpose",
DROP COLUMN "purchaseTimeline";

-- DropTable
DROP TABLE "CallMetric";

-- DropEnum
DROP TYPE "ContactChannel";

-- DropEnum
DROP TYPE "Disposition";

-- DropEnum
DROP TYPE "ExtractionFlag";

-- DropEnum
DROP TYPE "LeadTemperature";

-- DropEnum
DROP TYPE "LocationMatch";

-- DropEnum
DROP TYPE "PreferredNextAction";

-- DropEnum
DROP TYPE "PurchasePurpose";

-- DropEnum
DROP TYPE "PurchaseTimeline";
