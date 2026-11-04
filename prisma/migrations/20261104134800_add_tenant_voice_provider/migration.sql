-- CreateEnum
CREATE TYPE "VoiceProvider" AS ENUM ('BOLNA', 'SARVAM');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "voiceProvider" "VoiceProvider" NOT NULL DEFAULT 'BOLNA';

