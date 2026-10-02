-- CreateEnum
CREATE TYPE "LeadStopReason" AS ENUM ('LOW_BALANCE', 'MANUAL');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "stoppedReason" "LeadStopReason";
