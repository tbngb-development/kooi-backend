-- AlterTable SarvamAgent
ALTER TABLE "SarvamAgent" ADD COLUMN IF NOT EXISTS "allowedSchedule" JSONB;

