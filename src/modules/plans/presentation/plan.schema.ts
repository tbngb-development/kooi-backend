import { z } from "zod";

export const pricingModelEnum = z.enum(["STANDARD", "VOLUME", "CUSTOM"]);
export const callingChannelEnum = z.enum([
  "SHARED",
  "DEDICATED",
  "DEDICATED_WITH_NUMBER",
]);
export const dashboardTierEnum = z.enum([
  "BASIC",
  "STANDARD",
  "ADVANCED",
  "CUSTOM",
]);
export const agentCapabilityEnum = z.enum([
  "BASIC",
  "BASIC_KNOWLEDGE",
  "ADVANCED_KNOWLEDGE",
  "CUSTOM",
]);
export const integrationTierEnum = z.enum([
  "NONE",
  "BASIC",
  "API_SELECTED",
  "CUSTOM",
]);
export const supportTierEnum = z.enum(["STANDARD", "PRIORITY", "SLA"]);

const planVersionBaseSchema = {
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
};

export const createPlanVersionSchema = z.object(planVersionBaseSchema);

export const createPlanSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  displayOrder: z.number().int().min(0).optional(),
  description: z.string().nullable().optional(),
  publishImmediately: z.boolean().optional(),
  ...planVersionBaseSchema,
});

export const updatePlanSchema = z.object({
  name: z.string().min(1).optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  description: z.string().nullable().optional(),
});

export const updateTenantPlanOverridesSchema = z.object({
  onboardingFeeOverride: z.number().int().min(0).nullable().optional(),
  perMinuteRateOverride: z.number().int().min(0).nullable().optional(),
});

export const changePlanSchema = z.object({
  newPlanId: z.uuid("Invalid plan ID"),
});

export const listPlanSubscribersSchema = z.object({
  versionId: z.uuid("Invalid version ID").optional(),
  status: z
    .enum(["PENDING_PAYMENT", "ACTIVE", "EXPIRED", "CANCELLED"])
    .optional(),
  search: z.string().min(1).max(100).optional(),
  sortBy: z
    .enum(["activatedAt", "tenantName", "planVersion", "status", "createdAt"])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
