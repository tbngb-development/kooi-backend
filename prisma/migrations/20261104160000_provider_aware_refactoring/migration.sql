-- AlterTable Campaign
ALTER TABLE "Campaign" ADD COLUMN "provider" "VoiceProvider" DEFAULT 'BOLNA';
ALTER TABLE "Campaign" ADD COLUMN "sarvamCampaignId" TEXT;
CREATE INDEX "Campaign_sarvamCampaignId_idx" ON "Campaign"("sarvamCampaignId");
CREATE INDEX "Campaign_provider_idx" ON "Campaign"("provider");

-- AlterTable LeadBatch
ALTER TABLE "LeadBatch" ADD COLUMN "provider" "VoiceProvider" DEFAULT 'BOLNA';
ALTER TABLE "LeadBatch" ADD COLUMN "sarvamCohortId" TEXT;
CREATE INDEX "LeadBatch_sarvamCohortId_idx" ON "LeadBatch"("sarvamCohortId");
CREATE INDEX "LeadBatch_provider_idx" ON "LeadBatch"("provider");

-- AlterTable Call
ALTER TABLE "Call" ADD COLUMN "provider" "VoiceProvider" DEFAULT 'BOLNA';
ALTER TABLE "Call" ADD COLUMN "sarvamAttemptId" TEXT;
ALTER TABLE "Call" ADD COLUMN "sarvamInteractionId" TEXT;
ALTER TABLE "Call" ADD COLUMN "sarvamUserIdentifier" TEXT;
CREATE INDEX "Call_sarvamAttemptId_idx" ON "Call"("sarvamAttemptId");
CREATE INDEX "Call_sarvamInteractionId_idx" ON "Call"("sarvamInteractionId");
CREATE INDEX "Call_sarvamUserIdentifier_idx" ON "Call"("sarvamUserIdentifier");
CREATE INDEX "Call_provider_idx" ON "Call"("provider");

