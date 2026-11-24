-- AlterEnum
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- AlterTable Campaign
ALTER TABLE "Campaign" ALTER COLUMN "assistantId" DROP NOT NULL;
ALTER TABLE "Campaign" ADD COLUMN "sarvamAgentId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "startTimestamp" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN "endTimestamp" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN "allowedSchedule" JSONB;
CREATE INDEX "Campaign_sarvamAgentId_idx" ON "Campaign"("sarvamAgentId");
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_sarvamAgentId_fkey" FOREIGN KEY ("sarvamAgentId") REFERENCES "SarvamAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable Call
ALTER TABLE "Call" ADD COLUMN "sarvamAgentId" TEXT;
CREATE INDEX "Call_sarvamAgentId_idx" ON "Call"("sarvamAgentId");
ALTER TABLE "Call" ADD CONSTRAINT "Call_sarvamAgentId_fkey" FOREIGN KEY ("sarvamAgentId") REFERENCES "SarvamAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

