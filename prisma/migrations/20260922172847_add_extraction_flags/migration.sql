/*
  Warnings:

  - The values [QUALIFIED,NOT_QUALIFIED] on the enum `LeadStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "LeadStatus_new" AS ENUM ('PENDING', 'CALLING', 'CALLED', 'NO_ANSWER', 'FAILED', 'STOPPED');
ALTER TABLE "public"."Lead" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Lead" ALTER COLUMN "status" TYPE "LeadStatus_new" USING ("status"::text::"LeadStatus_new");
ALTER TYPE "LeadStatus" RENAME TO "LeadStatus_old";
ALTER TYPE "LeadStatus_new" RENAME TO "LeadStatus";
DROP TYPE "public"."LeadStatus_old";
ALTER TABLE "Lead" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "ExtractionDisposition" ADD COLUMN     "showInInsights" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showInOverview" BOOLEAN NOT NULL DEFAULT true;
