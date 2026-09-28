-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "familyId" TEXT;

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
