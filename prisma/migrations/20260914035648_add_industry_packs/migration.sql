/*
  Warnings:

  - You are about to drop the column `industry` on the `PlatformAgent` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "PlatformAgent_industry_idx";

-- AlterTable
ALTER TABLE "PlatformAgent" DROP COLUMN "industry",
ADD COLUMN     "industryPackId" TEXT;

-- CreateTable
CREATE TABLE "IndustryPack" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" "Industry" NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "allowedCallingHours" JSONB,
    "requiresConsent" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndustryPack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IndustryPack_slug_key" ON "IndustryPack"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "IndustryPack_industry_key" ON "IndustryPack"("industry");

-- CreateIndex
CREATE INDEX "IndustryPack_industry_idx" ON "IndustryPack"("industry");

-- CreateIndex
CREATE INDEX "PlatformAgent_industryPackId_idx" ON "PlatformAgent"("industryPackId");

-- AddForeignKey
ALTER TABLE "PlatformAgent" ADD CONSTRAINT "PlatformAgent_industryPackId_fkey" FOREIGN KEY ("industryPackId") REFERENCES "IndustryPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
