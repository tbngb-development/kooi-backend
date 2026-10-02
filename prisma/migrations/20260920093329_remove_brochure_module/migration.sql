/*
  Warnings:

  - You are about to drop the column `brochureId` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the `Brochure` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Brochure" DROP CONSTRAINT "Brochure_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_brochureId_fkey";

-- DropIndex
DROP INDEX "Campaign_brochureId_idx";

-- AlterTable
ALTER TABLE "Campaign" DROP COLUMN "brochureId";

-- DropTable
DROP TABLE "Brochure";
