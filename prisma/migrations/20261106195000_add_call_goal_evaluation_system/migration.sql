-- AlterTable
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "goalPassed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SarvamAgentGoal" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "outputVariableName" TEXT NOT NULL,
    "expectedValue" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SarvamAgentGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CampaignGoal" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "agentGoalId" TEXT,
    "outputVariableName" TEXT NOT NULL,
    "expectedValue" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CallGoalResult" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "campaignGoalId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallGoalResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SarvamAgentGoal_agentId_idx" ON "SarvamAgentGoal"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SarvamAgentGoal_agentId_outputVariableName_expectedValue_key" ON "SarvamAgentGoal"("agentId", "outputVariableName", "expectedValue");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignGoal_campaignId_idx" ON "CampaignGoal"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignGoal_campaignId_outputVariableName_expectedValue_key" ON "CampaignGoal"("campaignId", "outputVariableName", "expectedValue");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CallGoalResult_callId_idx" ON "CallGoalResult"("callId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CallGoalResult_campaignGoalId_idx" ON "CallGoalResult"("campaignGoalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CallGoalResult_attemptId_idx" ON "CallGoalResult"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CallGoalResult_callId_campaignGoalId_key" ON "CallGoalResult"("callId", "campaignGoalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Call_campaignId_isDeleted_goalPassed_idx" ON "Call"("campaignId", "isDeleted", "goalPassed");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SarvamAgentGoal_agentId_fkey') THEN
    ALTER TABLE "SarvamAgentGoal" ADD CONSTRAINT "SarvamAgentGoal_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "SarvamAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CampaignGoal_campaignId_fkey') THEN
    ALTER TABLE "CampaignGoal" ADD CONSTRAINT "CampaignGoal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CampaignGoal_agentGoalId_fkey') THEN
    ALTER TABLE "CampaignGoal" ADD CONSTRAINT "CampaignGoal_agentGoalId_fkey" FOREIGN KEY ("agentGoalId") REFERENCES "SarvamAgentGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CallGoalResult_callId_fkey') THEN
    ALTER TABLE "CallGoalResult" ADD CONSTRAINT "CallGoalResult_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CallGoalResult_campaignGoalId_fkey') THEN
    ALTER TABLE "CallGoalResult" ADD CONSTRAINT "CallGoalResult_campaignGoalId_fkey" FOREIGN KEY ("campaignGoalId") REFERENCES "CampaignGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

