-- 1. Add column as nullable
ALTER TABLE "ExtractionDisposition" ADD COLUMN "displayName" TEXT;

-- 2. Backfill existing rows from name
UPDATE "ExtractionDisposition" SET "displayName" = "name" WHERE "displayName" IS NULL;

-- 3. Make column NOT NULL
ALTER TABLE "ExtractionDisposition" ALTER COLUMN "displayName" SET NOT NULL;