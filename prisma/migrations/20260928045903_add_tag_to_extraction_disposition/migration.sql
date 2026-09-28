-- AlterTable
ALTER TABLE "ExtractionDisposition" ADD COLUMN     "tag" TEXT;

-- CreateIndex
CREATE INDEX "ExtractionDisposition_tag_idx" ON "ExtractionDisposition"("tag");
