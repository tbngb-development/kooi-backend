/*
  Warnings:

  - You are about to drop the column `bolnaId` on the `Assistant` table. All the data in the column will be lost.
  - Made the column `platformAgentId` on table `Assistant` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `bolnaApiKeyId` to the `PlatformAgent` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Assistant" DROP CONSTRAINT "Assistant_platformAgentId_fkey";

-- AlterTable
ALTER TABLE "Assistant" DROP COLUMN "bolnaId",
ALTER COLUMN "platformAgentId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PlatformAgent" ADD COLUMN     "bolnaApiKeyId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "PlatformAgent_bolnaApiKeyId_idx" ON "PlatformAgent"("bolnaApiKeyId");

-- AddForeignKey
ALTER TABLE "Assistant" ADD CONSTRAINT "Assistant_platformAgentId_fkey" FOREIGN KEY ("platformAgentId") REFERENCES "PlatformAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAgent" ADD CONSTRAINT "PlatformAgent_bolnaApiKeyId_fkey" FOREIGN KEY ("bolnaApiKeyId") REFERENCES "BolnaApiKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
