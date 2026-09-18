-- CreateEnum
CREATE TYPE "AgentGender" AS ENUM ('MALE', 'FEMALE');

-- AlterTable
ALTER TABLE "CallAnalysis" ADD COLUMN     "extractionResponse" JSONB;

-- AlterTable
ALTER TABLE "PlatformAgent" ADD COLUMN     "extractionConfig" JSONB,
ADD COLUMN     "gender" "AgentGender",
ADD COLUMN     "requiredVariables" JSONB,
ADD COLUMN     "welcomeMessage" TEXT;
