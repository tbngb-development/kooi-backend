/*
  Warnings:

  - You are about to drop the column `bolnaId` on the `ExtractionCategory` table. All the data in the column will be lost.
  - You are about to drop the column `industry` on the `ExtractionCategory` table. All the data in the column will be lost.
  - You are about to drop the column `platformAgentId` on the `ExtractionCategory` table. All the data in the column will be lost.
  - You are about to drop the column `bolnaId` on the `ExtractionDisposition` table. All the data in the column will be lost.
  - You are about to drop the column `categoryId` on the `ExtractionDisposition` table. All the data in the column will be lost.
  - You are about to drop the column `industry` on the `ExtractionDisposition` table. All the data in the column will be lost.
  - You are about to drop the column `industry` on the `IndustryPack` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ExtractionCategory" DROP CONSTRAINT "ExtractionCategory_platformAgentId_fkey";

-- DropForeignKey
ALTER TABLE "ExtractionDisposition" DROP CONSTRAINT "ExtractionDisposition_categoryId_fkey";

-- DropIndex
DROP INDEX "ExtractionCategory_bolnaId_key";

-- DropIndex
DROP INDEX "ExtractionCategory_industry_idx";

-- DropIndex
DROP INDEX "ExtractionCategory_platformAgentId_idx";

-- DropIndex
DROP INDEX "ExtractionDisposition_bolnaId_key";

-- DropIndex
DROP INDEX "ExtractionDisposition_categoryId_idx";

-- DropIndex
DROP INDEX "ExtractionDisposition_industry_idx";

-- DropIndex
DROP INDEX "IndustryPack_industry_idx";

-- DropIndex
DROP INDEX "IndustryPack_industry_key";

-- AlterTable
ALTER TABLE "CallAnalysis" ADD COLUMN     "extractionDispositionId" TEXT;

-- AlterTable
ALTER TABLE "ExtractionCategory" DROP COLUMN "bolnaId",
DROP COLUMN "industry",
DROP COLUMN "platformAgentId";

-- AlterTable
ALTER TABLE "ExtractionDisposition" DROP COLUMN "bolnaId",
DROP COLUMN "categoryId",
DROP COLUMN "industry";

-- AlterTable
ALTER TABLE "IndustryPack" DROP COLUMN "industry";

-- DropEnum
DROP TYPE "Industry";

-- CreateTable
CREATE TABLE "ExtractionCategoryIndustry" (
    "categoryId" TEXT NOT NULL,
    "industryPackId" TEXT NOT NULL,

    CONSTRAINT "ExtractionCategoryIndustry_pkey" PRIMARY KEY ("categoryId","industryPackId")
);

-- CreateTable
CREATE TABLE "ExtractionDispositionIndustry" (
    "dispositionId" TEXT NOT NULL,
    "industryPackId" TEXT NOT NULL,

    CONSTRAINT "ExtractionDispositionIndustry_pkey" PRIMARY KEY ("dispositionId","industryPackId")
);

-- CreateTable
CREATE TABLE "ExtractionCategoryDisposition" (
    "categoryId" TEXT NOT NULL,
    "dispositionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExtractionCategoryDisposition_pkey" PRIMARY KEY ("categoryId","dispositionId")
);

-- CreateTable
CREATE TABLE "PlatformAgentCategory" (
    "platformAgentId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlatformAgentCategory_pkey" PRIMARY KEY ("platformAgentId","categoryId")
);

-- CreateTable
CREATE TABLE "PlatformAgentDisposition" (
    "platformAgentId" TEXT NOT NULL,
    "dispositionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlatformAgentDisposition_pkey" PRIMARY KEY ("platformAgentId","dispositionId")
);

-- CreateTable
CREATE TABLE "AgentBolnaExtractionBinding" (
    "id" TEXT NOT NULL,
    "platformAgentId" TEXT NOT NULL,
    "dispositionId" TEXT NOT NULL,
    "bolnaAgentId" TEXT NOT NULL,
    "bolnaCategoryId" TEXT NOT NULL,
    "bolnaDispositionId" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentBolnaExtractionBinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExtractionCategoryIndustry_industryPackId_idx" ON "ExtractionCategoryIndustry"("industryPackId");

-- CreateIndex
CREATE INDEX "ExtractionDispositionIndustry_industryPackId_idx" ON "ExtractionDispositionIndustry"("industryPackId");

-- CreateIndex
CREATE INDEX "ExtractionCategoryDisposition_dispositionId_idx" ON "ExtractionCategoryDisposition"("dispositionId");

-- CreateIndex
CREATE INDEX "PlatformAgentCategory_categoryId_idx" ON "PlatformAgentCategory"("categoryId");

-- CreateIndex
CREATE INDEX "PlatformAgentDisposition_dispositionId_idx" ON "PlatformAgentDisposition"("dispositionId");

-- CreateIndex
CREATE INDEX "AgentBolnaExtractionBinding_bolnaAgentId_idx" ON "AgentBolnaExtractionBinding"("bolnaAgentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentBolnaExtractionBinding_platformAgentId_dispositionId_key" ON "AgentBolnaExtractionBinding"("platformAgentId", "dispositionId");

-- CreateIndex
CREATE INDEX "CallAnalysis_extractionDispositionId_idx" ON "CallAnalysis"("extractionDispositionId");

-- CreateIndex
CREATE INDEX "ExtractionCategory_slug_idx" ON "ExtractionCategory"("slug");

-- CreateIndex
CREATE INDEX "ExtractionDisposition_slug_idx" ON "ExtractionDisposition"("slug");

-- CreateIndex
CREATE INDEX "IndustryPack_slug_idx" ON "IndustryPack"("slug");

-- AddForeignKey
ALTER TABLE "CallAnalysis" ADD CONSTRAINT "CallAnalysis_extractionDispositionId_fkey" FOREIGN KEY ("extractionDispositionId") REFERENCES "ExtractionDisposition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionCategoryIndustry" ADD CONSTRAINT "ExtractionCategoryIndustry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExtractionCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionCategoryIndustry" ADD CONSTRAINT "ExtractionCategoryIndustry_industryPackId_fkey" FOREIGN KEY ("industryPackId") REFERENCES "IndustryPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionDispositionIndustry" ADD CONSTRAINT "ExtractionDispositionIndustry_dispositionId_fkey" FOREIGN KEY ("dispositionId") REFERENCES "ExtractionDisposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionDispositionIndustry" ADD CONSTRAINT "ExtractionDispositionIndustry_industryPackId_fkey" FOREIGN KEY ("industryPackId") REFERENCES "IndustryPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionCategoryDisposition" ADD CONSTRAINT "ExtractionCategoryDisposition_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExtractionCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionCategoryDisposition" ADD CONSTRAINT "ExtractionCategoryDisposition_dispositionId_fkey" FOREIGN KEY ("dispositionId") REFERENCES "ExtractionDisposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAgentCategory" ADD CONSTRAINT "PlatformAgentCategory_platformAgentId_fkey" FOREIGN KEY ("platformAgentId") REFERENCES "PlatformAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAgentCategory" ADD CONSTRAINT "PlatformAgentCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExtractionCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAgentDisposition" ADD CONSTRAINT "PlatformAgentDisposition_platformAgentId_fkey" FOREIGN KEY ("platformAgentId") REFERENCES "PlatformAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAgentDisposition" ADD CONSTRAINT "PlatformAgentDisposition_dispositionId_fkey" FOREIGN KEY ("dispositionId") REFERENCES "ExtractionDisposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentBolnaExtractionBinding" ADD CONSTRAINT "AgentBolnaExtractionBinding_platformAgentId_fkey" FOREIGN KEY ("platformAgentId") REFERENCES "PlatformAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentBolnaExtractionBinding" ADD CONSTRAINT "AgentBolnaExtractionBinding_dispositionId_fkey" FOREIGN KEY ("dispositionId") REFERENCES "ExtractionDisposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
