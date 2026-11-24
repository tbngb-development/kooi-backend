-- AlterTable
ALTER TABLE "SarvamAgent" ADD COLUMN "audioRecordings" JSONB NOT NULL DEFAULT '[]';

-- Backfill existing audioUrl into audioRecordings if present
UPDATE "SarvamAgent"
SET "audioRecordings" = jsonb_build_array(jsonb_build_object('language', 'Default', 'audioUrl', "audioUrl"))
WHERE "audioUrl" IS NOT NULL AND ("audioRecordings" IS NULL OR "audioRecordings" = '[]'::jsonb);

