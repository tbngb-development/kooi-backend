-- CreateEnum
CREATE TYPE "SarvamAgentStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "SarvamAgent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "appVersion" INTEGER NOT NULL DEFAULT 1,
    "attemptsPerSecond" INTEGER,
    "webhookUrl" TEXT,
    "agentVariables" JSONB NOT NULL DEFAULT '[]',
    "welcomeMessage" JSONB NOT NULL DEFAULT '{"defaultMessage":""}',
    "outputVariables" JSONB NOT NULL DEFAULT '[]',
    "allowTenantVisible" BOOLEAN NOT NULL DEFAULT false,
    "status" "SarvamAgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SarvamAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SarvamAgentTenantOverride" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "variableOverrides" JSONB NOT NULL DEFAULT '{}',
    "welcomeMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SarvamAgentTenantOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SarvamAgent_apiKeyId_idx" ON "SarvamAgent"("apiKeyId");

-- CreateIndex
CREATE INDEX "SarvamAgent_status_idx" ON "SarvamAgent"("status");

-- CreateIndex
CREATE INDEX "SarvamAgent_allowTenantVisible_idx" ON "SarvamAgent"("allowTenantVisible");

-- CreateIndex
CREATE UNIQUE INDEX "SarvamAgent_apiKeyId_appId_key" ON "SarvamAgent"("apiKeyId", "appId");

-- CreateIndex
CREATE INDEX "SarvamAgentTenantOverride_agentId_idx" ON "SarvamAgentTenantOverride"("agentId");

-- CreateIndex
CREATE INDEX "SarvamAgentTenantOverride_tenantId_idx" ON "SarvamAgentTenantOverride"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SarvamAgentTenantOverride_agentId_tenantId_key" ON "SarvamAgentTenantOverride"("agentId", "tenantId");

-- AddForeignKey
ALTER TABLE "SarvamAgent" ADD CONSTRAINT "SarvamAgent_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "SarvamApiKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SarvamAgentTenantOverride" ADD CONSTRAINT "SarvamAgentTenantOverride_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "SarvamAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SarvamAgentTenantOverride" ADD CONSTRAINT "SarvamAgentTenantOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

