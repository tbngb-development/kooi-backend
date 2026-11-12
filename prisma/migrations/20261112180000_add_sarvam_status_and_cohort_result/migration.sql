-- AlterTable Campaign
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "sarvamStatus" TEXT;

-- AlterTable LeadBatch
ALTER TABLE "LeadBatch" ADD COLUMN IF NOT EXISTS "sarvamStatus" TEXT;
ALTER TABLE "LeadBatch" ADD COLUMN IF NOT EXISTS "cohortResult" JSONB;

-- AlterTable SarvamAgent
ALTER TABLE "SarvamAgent" ADD COLUMN IF NOT EXISTS "allowedSchedule" JSONB;
