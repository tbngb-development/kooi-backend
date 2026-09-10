import { z } from "zod";

const pricingModelEnum = z.enum(["STANDARD", "VOLUME", "CUSTOM"]);
const callingChannelEnum = z.enum([
  "SHARED",
  "DEDICATED",
  "DEDICATED_WITH_NUMBER",
]);
const dashboardTierEnum = z.enum(["BASIC", "STANDARD", "ADVANCED", "CUSTOM"]);
const agentCapabilityEnum = z.enum([
  "BASIC",
  "BASIC_KNOWLEDGE",
  "ADVANCED_KNOWLEDGE",
  "CUSTOM",
]);
const integrationTierEnum = z.enum(["NONE", "BASIC", "API_SELECTED", "CUSTOM"]);
const supportTierEnum = z.enum(["STANDARD", "PRIORITY", "SLA"]);

export const createPlanSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens"),
  displayOrder: z.number().int().min(0).optional(),

  pricingModel: pricingModelEnum.optional(),
  onboardingFee: z.number().int().min(0),
  onboardingFeeOriginal: z.number().int().min(0).nullable().optional(),
  perMinuteRate: z.number().int().min(0),
  billingMinimumSec: z.number().int().min(1).optional(),
  billingIncrementSec: z.number().int().min(1).optional(),

  maxActiveCampaigns: z.number().int().min(1).nullable().optional(),
  maxLeadsPerBatch: z.number().int().min(1).nullable().optional(),
  maxAgents: z.number().int().min(1).nullable().optional(),
  maxTeamMembers: z.number().int().min(1).nullable().optional(),
  retryAutomation: z.boolean().optional(),
  industryPackLimit: z.number().int().min(1).nullable().optional(),

  callingChannel: callingChannelEnum.optional(),
  brochureUpload: z.boolean().optional(),

  dashboardTier: dashboardTierEnum.optional(),
  agentCapability: agentCapabilityEnum.optional(),
  integrations: integrationTierEnum.optional(),
  supportTier: supportTierEnum.optional(),

  lowBalanceThreshold: z.number().int().min(0).optional(),
  includedBalance: z.number().int().min(0).optional(),
  bonusValidityDays: z.number().int().min(1).nullable().optional(),
});

export const updatePlanSchema = z.object({
  name: z.string().min(1).optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),

  pricingModel: pricingModelEnum.optional(),
  onboardingFee: z.number().int().min(0).optional(),
  onboardingFeeOriginal: z.number().int().min(0).nullable().optional(),
  perMinuteRate: z.number().int().min(0).optional(),
  billingMinimumSec: z.number().int().min(1).optional(),
  billingIncrementSec: z.number().int().min(1).optional(),

  maxActiveCampaigns: z.number().int().min(1).nullable().optional(),
  maxLeadsPerBatch: z.number().int().min(1).nullable().optional(),
  maxAgents: z.number().int().min(1).nullable().optional(),
  maxTeamMembers: z.number().int().min(1).nullable().optional(),
  retryAutomation: z.boolean().optional(),
  industryPackLimit: z.number().int().min(1).nullable().optional(),

  callingChannel: callingChannelEnum.optional(),
  brochureUpload: z.boolean().optional(),

  dashboardTier: dashboardTierEnum.optional(),
  agentCapability: agentCapabilityEnum.optional(),
  integrations: integrationTierEnum.optional(),
  supportTier: supportTierEnum.optional(),

  lowBalanceThreshold: z.number().int().min(0).optional(),
  includedBalance: z.number().int().min(0).optional(),
  bonusValidityDays: z.number().int().min(1).nullable().optional(),
});
