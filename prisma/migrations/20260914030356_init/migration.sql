-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('OWNER', 'ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('CREATED', 'SCHEDULED', 'RUNNING', 'STOPPED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('PENDING', 'CALLING', 'CALLED', 'QUALIFIED', 'NOT_QUALIFIED', 'NO_ANSWER', 'FAILED');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('PENDING', 'CALLING', 'COMPLETED', 'FAILED', 'NO_ANSWER', 'BUSY');

-- CreateEnum
CREATE TYPE "Disposition" AS ENUM ('INTERESTED_SEND_DETAILS', 'QUALIFIED_CONSULTANT_FOLLOWUP', 'SITE_VISIT_INTEREST', 'INTERESTED_GENERAL', 'FOLLOWUP_REQUESTED', 'NOT_INTERESTED', 'DO_NOT_CALL', 'WRONG_NUMBER', 'ALREADY_PURCHASED', 'BROKER', 'LANGUAGE_CALLBACK_REQUIRED', 'CALL_ENDED_BY_CUSTOMER', 'CALL_ENDED_ABUSIVE', 'NO_RESPONSE', 'CALL_DROPPED');

-- CreateEnum
CREATE TYPE "LeadTemperature" AS ENUM ('HOT', 'WARM', 'NURTURE', 'COLD', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "PurchaseTimeline" AS ENUM ('WITHIN_3_MONTHS', 'WITHIN_6_MONTHS', 'WITHIN_1_YEAR', 'AFTER_1_YEAR', 'FLEXIBLE', 'NOT_SHARED');

-- CreateEnum
CREATE TYPE "PurchasePurpose" AS ENUM ('OWN_USE', 'INVESTMENT', 'BOTH', 'NOT_SHARED');

-- CreateEnum
CREATE TYPE "PreferredNextAction" AS ENUM ('SEND_DETAILS', 'CONSULTANT_CALL', 'SITE_VISIT', 'FOLLOWUP_CALL', 'NONE');

-- CreateEnum
CREATE TYPE "ContactChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'NOT_ASKED');

-- CreateEnum
CREATE TYPE "LocationMatch" AS ENUM ('MATCH', 'MISMATCH', 'NOT_ASKED', 'NOT_MENTIONED');

-- CreateEnum
CREATE TYPE "ExtractionFlag" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('STANDARD', 'VOLUME', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CallingChannel" AS ENUM ('SHARED', 'DEDICATED', 'DEDICATED_WITH_NUMBER');

-- CreateEnum
CREATE TYPE "DashboardTier" AS ENUM ('BASIC', 'STANDARD', 'ADVANCED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AgentCapability" AS ENUM ('BASIC', 'BASIC_KNOWLEDGE', 'ADVANCED_KNOWLEDGE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "IntegrationTier" AS ENUM ('NONE', 'BASIC', 'API_SELECTED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SupportTier" AS ENUM ('STANDARD', 'PRIORITY', 'SLA');

-- CreateEnum
CREATE TYPE "PlanVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TenantPlanStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TenantPlanEventType" AS ENUM ('CREATED', 'ACTIVATED', 'PLAN_CHANGED', 'OVERRIDES_UPDATED', 'BONUS_GRANTED', 'BONUS_EXPIRED', 'CANCELLED', 'EXPIRED', 'REACTIVATED');

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('CREDIT', 'DEBIT', 'BONUS', 'BONUS_EXPIRY', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "WalletTxSourceType" AS ENUM ('RECHARGE', 'CALL', 'PLAN_BONUS', 'BONUS_EXPIRY', 'ADMIN_ADJUSTMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "RechargeStatus" AS ENUM ('INITIATED', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RechargePurpose" AS ENUM ('ONBOARDING', 'WALLET_TOPUP');

-- CreateEnum
CREATE TYPE "BolnaApiKeyType" AS ENUM ('GENERAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "Industry" AS ENUM ('GENERIC', 'REAL_ESTATE', 'BFSI', 'HEALTHCARE', 'RECRUITMENT', 'EDUCATION', 'ECOMMERCE');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bolnaApiKeyId" TEXT,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantUser" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assistant" (
    "id" TEXT NOT NULL,
    "bolnaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "platformAgentId" TEXT,

    CONSTRAINT "Assistant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brochure" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileSizeMB" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "rawTextLength" INTEGER NOT NULL,
    "projectName" TEXT,
    "developerName" TEXT,
    "reraNumber" TEXT,
    "projectWebsite" TEXT,
    "contactNumber" TEXT,
    "city" TEXT,
    "area" TEXT,
    "state" TEXT,
    "landmark" TEXT,
    "fullAddress" TEXT,
    "propertyTypes" TEXT[],
    "configurations" TEXT[],
    "totalUnits" INTEGER,
    "totalTowers" INTEGER,
    "totalFloors" INTEGER,
    "sizeMin" DOUBLE PRECISION,
    "sizeMax" DOUBLE PRECISION,
    "sizeUnit" TEXT,
    "startingPrice" DOUBLE PRECISION,
    "maxPrice" DOUBLE PRECISION,
    "pricePerSqft" DOUBLE PRECISION,
    "priceLabel" TEXT,
    "paymentPlan" TEXT,
    "bankApprovals" TEXT[],
    "maintenanceCharge" TEXT,
    "possessionDate" TEXT,
    "launchDate" TEXT,
    "constructionStatus" TEXT DEFAULT 'unknown',
    "amenities" TEXT[],
    "specifications" TEXT[],
    "nearbyInfrastructure" TEXT[],
    "usps" TEXT[],
    "minimumBudget" DOUBLE PRECISION,
    "maximumBudget" DOUBLE PRECISION,
    "targetBuyerProfile" TEXT,
    "preferredLocations" TEXT[],
    "investmentType" TEXT[],
    "keyQualifyingQuestions" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extractionWarnings" TEXT[],
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brochure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "tenantId" TEXT NOT NULL,
    "assistantId" TEXT NOT NULL,
    "brochureId" TEXT,
    "variables" JSONB,
    "defaultRetryConfig" JSONB,
    "totalLeads" INTEGER NOT NULL DEFAULT 0,
    "calledLeads" INTEGER NOT NULL DEFAULT 0,
    "completedLeads" INTEGER NOT NULL DEFAULT 0,
    "failedLeads" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadBatch" (
    "id" TEXT NOT NULL,
    "bolnaBatchId" TEXT,
    "campaignId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'CREATED',
    "fileName" TEXT,
    "originalFileUrl" TEXT,
    "transformedCsvUrl" TEXT,
    "totalLeads" INTEGER NOT NULL DEFAULT 0,
    "calledLeads" INTEGER NOT NULL DEFAULT 0,
    "completedLeads" INTEGER NOT NULL DEFAULT 0,
    "failedLeads" INTEGER NOT NULL DEFAULT 0,
    "retryConfig" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "bolnaScheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "LeadBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "company" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'PENDING',
    "doNotCall" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "batchId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "bolnaCallId" TEXT,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "batchId" TEXT,
    "status" "CallStatus" NOT NULL DEFAULT 'PENDING',
    "duration" INTEGER,
    "cost" DOUBLE PRECISION,
    "platformCost" INTEGER,
    "billableSeconds" INTEGER,
    "planVersionId" TEXT,
    "appliedRate" INTEGER,
    "appliedMinSec" INTEGER,
    "appliedIncrementSec" INTEGER,
    "chargedAmount" INTEGER,
    "recording" TEXT,
    "transcript" TEXT,
    "transcriptMessages" JSONB,
    "summary" TEXT,
    "callHistory" JSONB,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallAnalysis" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "disposition" "Disposition",
    "leadTemperature" "LeadTemperature",
    "preferredConfiguration" TEXT,
    "budgetRange" TEXT,
    "purchaseTimeline" "PurchaseTimeline",
    "purchasePurpose" "PurchasePurpose",
    "locationMatch" "LocationMatch",
    "customerLocationPref" TEXT,
    "preferredNextAction" "PreferredNextAction",
    "preferredContactChannel" "ContactChannel",
    "followupSchedule" TEXT,
    "doNotCall" "ExtractionFlag",
    "languageSupportRequired" "ExtractionFlag",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanVersion" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PlanVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "pricingModel" "PricingModel" NOT NULL DEFAULT 'STANDARD',
    "onboardingFee" INTEGER NOT NULL,
    "onboardingFeeOriginal" INTEGER,
    "perMinuteRate" INTEGER NOT NULL,
    "billingMinimumSec" INTEGER NOT NULL DEFAULT 30,
    "billingIncrementSec" INTEGER NOT NULL DEFAULT 15,
    "maxActiveCampaigns" INTEGER,
    "maxLeadsPerBatch" INTEGER,
    "maxAgents" INTEGER,
    "maxTeamMembers" INTEGER,
    "retryAutomation" BOOLEAN NOT NULL DEFAULT false,
    "industryPackLimit" INTEGER,
    "callingChannel" "CallingChannel" NOT NULL DEFAULT 'SHARED',
    "brochureUpload" BOOLEAN NOT NULL DEFAULT false,
    "dashboardTier" "DashboardTier" NOT NULL DEFAULT 'BASIC',
    "agentCapability" "AgentCapability" NOT NULL DEFAULT 'BASIC',
    "integrations" "IntegrationTier" NOT NULL DEFAULT 'NONE',
    "supportTier" "SupportTier" NOT NULL DEFAULT 'STANDARD',
    "lowBalanceThreshold" INTEGER NOT NULL DEFAULT 10000,
    "includedBalance" INTEGER NOT NULL DEFAULT 0,
    "bonusValidityDays" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "status" "TenantPlanStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "onboardingFeeOverride" INTEGER,
    "perMinuteRateOverride" INTEGER,
    "activatedAt" TIMESTAMP(3),
    "bonusExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantPlanEvent" (
    "id" TEXT NOT NULL,
    "tenantPlanId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "TenantPlanEventType" NOT NULL,
    "fromPlanVersionId" TEXT,
    "toPlanVersionId" TEXT,
    "metadata" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantPlanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cashBalance" INTEGER NOT NULL DEFAULT 0,
    "bonusBalance" INTEGER NOT NULL DEFAULT 0,
    "bonusExpiresAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "cashDelta" INTEGER NOT NULL,
    "bonusDelta" INTEGER NOT NULL,
    "cashBalanceAfter" INTEGER NOT NULL,
    "bonusBalanceAfter" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "description" TEXT NOT NULL,
    "sourceType" "WalletTxSourceType",
    "sourceId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recharge" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "purpose" "RechargePurpose" NOT NULL DEFAULT 'WALLET_TOPUP',
    "status" "RechargeStatus" NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "razorpaySignature" TEXT,
    "failureReason" TEXT,
    "tenantPlanId" TEXT,
    "targetPlanVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Recharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BolnaApiKey" (
    "id" TEXT NOT NULL,
    "keyIdentifier" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "type" "BolnaApiKeyType" NOT NULL DEFAULT 'GENERAL',
    "isPlatformDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "lastAccessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BolnaApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tenantName" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "planId" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "lastResentAt" TIMESTAMP(3),
    "skipPayment" BOOLEAN NOT NULL DEFAULT false,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "creditIncludedBalance" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAgent" (
    "id" TEXT NOT NULL,
    "bolnaId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" "Industry" NOT NULL DEFAULT 'GENERIC',
    "category" TEXT,
    "description" TEXT,
    "defaultConfig" JSONB NOT NULL,
    "systemPrompt" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAgent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_email_key" ON "Tenant"("email");

-- CreateIndex
CREATE INDEX "Tenant_email_idx" ON "Tenant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "TenantUser_tenantId_idx" ON "TenantUser"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantUser_userId_tenantId_key" ON "TenantUser"("userId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_userId_key" ON "PlatformAdmin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "Brochure_tenantId_idx" ON "Brochure"("tenantId");

-- CreateIndex
CREATE INDEX "Campaign_brochureId_idx" ON "Campaign"("brochureId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadBatch_bolnaBatchId_key" ON "LeadBatch"("bolnaBatchId");

-- CreateIndex
CREATE INDEX "LeadBatch_tenantId_idx" ON "LeadBatch"("tenantId");

-- CreateIndex
CREATE INDEX "LeadBatch_campaignId_idx" ON "LeadBatch"("campaignId");

-- CreateIndex
CREATE INDEX "LeadBatch_bolnaBatchId_idx" ON "LeadBatch"("bolnaBatchId");

-- CreateIndex
CREATE INDEX "Lead_tenantId_idx" ON "Lead"("tenantId");

-- CreateIndex
CREATE INDEX "Lead_campaignId_idx" ON "Lead"("campaignId");

-- CreateIndex
CREATE INDEX "Lead_batchId_idx" ON "Lead"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_phone_campaignId_key" ON "Lead"("phone", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Call_bolnaCallId_key" ON "Call"("bolnaCallId");

-- CreateIndex
CREATE INDEX "Call_tenantId_idx" ON "Call"("tenantId");

-- CreateIndex
CREATE INDEX "Call_campaignId_idx" ON "Call"("campaignId");

-- CreateIndex
CREATE INDEX "Call_leadId_idx" ON "Call"("leadId");

-- CreateIndex
CREATE INDEX "Call_batchId_idx" ON "Call"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "CallAnalysis_callId_key" ON "CallAnalysis"("callId");

-- CreateIndex
CREATE INDEX "CallAnalysis_tenantId_idx" ON "CallAnalysis"("tenantId");

-- CreateIndex
CREATE INDEX "CallAnalysis_callId_idx" ON "CallAnalysis"("callId");

-- CreateIndex
CREATE INDEX "CallAnalysis_disposition_idx" ON "CallAnalysis"("disposition");

-- CreateIndex
CREATE INDEX "CallAnalysis_leadTemperature_idx" ON "CallAnalysis"("leadTemperature");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");

-- CreateIndex
CREATE INDEX "PlanVersion_status_idx" ON "PlanVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PlanVersion_planId_version_key" ON "PlanVersion"("planId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "TenantPlan_tenantId_key" ON "TenantPlan"("tenantId");

-- CreateIndex
CREATE INDEX "TenantPlan_planId_idx" ON "TenantPlan"("planId");

-- CreateIndex
CREATE INDEX "TenantPlan_planVersionId_idx" ON "TenantPlan"("planVersionId");

-- CreateIndex
CREATE INDEX "TenantPlan_status_idx" ON "TenantPlan"("status");

-- CreateIndex
CREATE INDEX "TenantPlanEvent_tenantId_createdAt_idx" ON "TenantPlanEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TenantPlanEvent_tenantPlanId_createdAt_idx" ON "TenantPlanEvent"("tenantPlanId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_tenantId_key" ON "Wallet"("tenantId");

-- CreateIndex
CREATE INDEX "WalletTransaction_tenantId_createdAt_idx" ON "WalletTransaction"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_sourceType_sourceId_idx" ON "WalletTransaction"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_walletId_idempotencyKey_key" ON "WalletTransaction"("walletId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Recharge_razorpayOrderId_key" ON "Recharge"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Recharge_razorpayPaymentId_key" ON "Recharge"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "Recharge_tenantId_status_idx" ON "Recharge"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Recharge_tenantPlanId_idx" ON "Recharge"("tenantPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantInvite_token_key" ON "TenantInvite"("token");

-- CreateIndex
CREATE INDEX "TenantInvite_token_idx" ON "TenantInvite"("token");

-- CreateIndex
CREATE INDEX "TenantInvite_email_idx" ON "TenantInvite"("email");

-- CreateIndex
CREATE INDEX "TenantInvite_status_idx" ON "TenantInvite"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAgent_bolnaId_key" ON "PlatformAgent"("bolnaId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAgent_slug_key" ON "PlatformAgent"("slug");

-- CreateIndex
CREATE INDEX "PlatformAgent_industry_idx" ON "PlatformAgent"("industry");

-- CreateIndex
CREATE INDEX "PlatformAgent_category_idx" ON "PlatformAgent"("category");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_bolnaApiKeyId_fkey" FOREIGN KEY ("bolnaApiKeyId") REFERENCES "BolnaApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantUser" ADD CONSTRAINT "TenantUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantUser" ADD CONSTRAINT "TenantUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAdmin" ADD CONSTRAINT "PlatformAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assistant" ADD CONSTRAINT "Assistant_platformAgentId_fkey" FOREIGN KEY ("platformAgentId") REFERENCES "PlatformAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assistant" ADD CONSTRAINT "Assistant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brochure" ADD CONSTRAINT "Brochure_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_brochureId_fkey" FOREIGN KEY ("brochureId") REFERENCES "Brochure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadBatch" ADD CONSTRAINT "LeadBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadBatch" ADD CONSTRAINT "LeadBatch_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "LeadBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "LeadBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAnalysis" ADD CONSTRAINT "CallAnalysis_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAnalysis" ADD CONSTRAINT "CallAnalysis_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPlan" ADD CONSTRAINT "TenantPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPlan" ADD CONSTRAINT "TenantPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPlan" ADD CONSTRAINT "TenantPlan_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPlanEvent" ADD CONSTRAINT "TenantPlanEvent_tenantPlanId_fkey" FOREIGN KEY ("tenantPlanId") REFERENCES "TenantPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPlanEvent" ADD CONSTRAINT "TenantPlanEvent_fromPlanVersionId_fkey" FOREIGN KEY ("fromPlanVersionId") REFERENCES "PlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPlanEvent" ADD CONSTRAINT "TenantPlanEvent_toPlanVersionId_fkey" FOREIGN KEY ("toPlanVersionId") REFERENCES "PlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recharge" ADD CONSTRAINT "Recharge_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recharge" ADD CONSTRAINT "Recharge_tenantPlanId_fkey" FOREIGN KEY ("tenantPlanId") REFERENCES "TenantPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantInvite" ADD CONSTRAINT "TenantInvite_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
