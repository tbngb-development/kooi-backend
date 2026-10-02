-- AlterTable
ALTER TABLE "LeadBatch" ADD COLUMN     "processingError" TEXT,
ADD COLUMN     "processingProgress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "processingStage" TEXT,
ADD COLUMN     "rawFileUrl" TEXT;
