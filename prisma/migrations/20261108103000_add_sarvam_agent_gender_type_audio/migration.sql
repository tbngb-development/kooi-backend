-- AlterTable
ALTER TABLE "SarvamAgent" ADD COLUMN "gender" "AgentGender",
ADD COLUMN "type" "PlatformAgentType" NOT NULL DEFAULT 'OUTBOUND',
ADD COLUMN "audioUrl" TEXT;

-- CreateIndex
CREATE INDEX "SarvamAgent_type_idx" ON "SarvamAgent"("type");

-- CreateIndex
CREATE INDEX "SarvamAgent_gender_idx" ON "SarvamAgent"("gender");

