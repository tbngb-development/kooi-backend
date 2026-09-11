import prisma from "../shared/config/database/prisma";
import type {
  CallingChannel,
  DashboardTier,
  AgentCapability,
  IntegrationTier,
  SupportTier,
  PricingModel,
} from "@prisma/client";

interface SeedPlanData {
  slug: string;
  name: string;
  displayOrder: number;
  description: string;

  // Version 1 Snapshot
  pricingModel: PricingModel;
  onboardingFee: number;
  onboardingFeeOriginal: number | null;
  perMinuteRate: number;
  billingMinimumSec: number;
  billingIncrementSec: number;

  maxActiveCampaigns: number | null;
  maxLeadsPerBatch: number | null;
  maxAgents: number | null;
  maxTeamMembers: number | null;
  retryAutomation: boolean;
  industryPackLimit: number | null;

  callingChannel: CallingChannel;
  brochureUpload: boolean;

  dashboardTier: DashboardTier;
  agentCapability: AgentCapability;
  integrations: IntegrationTier;
  supportTier: SupportTier;

  lowBalanceThreshold: number;
  includedBalance: number;
  bonusValidityDays: number | null;
}

const seedPlansData: SeedPlanData[] = [
  {
    slug: "launch",
    name: "Launch",
    displayOrder: 1,
    description:
      "Ideal for small teams launching their first AI cold-calling campaigns.",

    pricingModel: "STANDARD",
    onboardingFee: 999900, // ₹9,999
    onboardingFeeOriginal: 4999900, // ₹49,999
    perMinuteRate: 1200, // ₹12/min
    billingMinimumSec: 30,
    billingIncrementSec: 15,

    maxActiveCampaigns: 1,
    maxLeadsPerBatch: 10000,
    maxAgents: 1,
    maxTeamMembers: 2,
    retryAutomation: false,
    industryPackLimit: 1,

    callingChannel: "SHARED",
    brochureUpload: false,

    dashboardTier: "BASIC",
    agentCapability: "BASIC",
    integrations: "NONE",
    supportTier: "STANDARD",

    lowBalanceThreshold: 10000, // ₹100
    includedBalance: 50000, // ₹500
    bonusValidityDays: 5,
  },
  {
    slug: "growth",
    name: "Growth",
    displayOrder: 2,
    description:
      "For growing businesses scaling multi-agent outreach with smart retries.",

    pricingModel: "STANDARD",
    onboardingFee: 1999900, // ₹19,999
    onboardingFeeOriginal: 9999900, // ₹99,999
    perMinuteRate: 1000, // ₹10/min
    billingMinimumSec: 30,
    billingIncrementSec: 15,

    maxActiveCampaigns: 2,
    maxLeadsPerBatch: 10000,
    maxAgents: 2,
    maxTeamMembers: 5,
    retryAutomation: true,
    industryPackLimit: 1,

    callingChannel: "SHARED",
    brochureUpload: false,

    dashboardTier: "STANDARD",
    agentCapability: "BASIC_KNOWLEDGE",
    integrations: "BASIC",
    supportTier: "STANDARD",

    lowBalanceThreshold: 20000, // ₹200
    includedBalance: 200000, // ₹2,000
    bonusValidityDays: 10,
  },
  {
    slug: "scale",
    name: "Scale",
    displayOrder: 3,
    description:
      "High-volume qualification with dedicated caller ID and knowledge bases.",

    pricingModel: "STANDARD",
    onboardingFee: 4999900, // ₹49,999
    onboardingFeeOriginal: 19999900, // ₹199,999
    perMinuteRate: 800, // ₹8/min
    billingMinimumSec: 30,
    billingIncrementSec: 15,

    maxActiveCampaigns: 5,
    maxLeadsPerBatch: 10000,
    maxAgents: 5,
    maxTeamMembers: 10,
    retryAutomation: true,
    industryPackLimit: 2,

    callingChannel: "DEDICATED_WITH_NUMBER",
    brochureUpload: true,

    dashboardTier: "ADVANCED",
    agentCapability: "ADVANCED_KNOWLEDGE",
    integrations: "API_SELECTED",
    supportTier: "PRIORITY",

    lowBalanceThreshold: 50000, // ₹500
    includedBalance: 500000, // ₹5,000
    bonusValidityDays: 15,
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    displayOrder: 4,
    description:
      "Tailored calling infrastructure, dedicated trunks, SLA, and custom pricing.",

    pricingModel: "CUSTOM",
    onboardingFee: 0,
    onboardingFeeOriginal: null,
    perMinuteRate: 600, // ₹6/min baseline
    billingMinimumSec: 30,
    billingIncrementSec: 15,

    maxActiveCampaigns: null, // Unlimited
    maxLeadsPerBatch: null, // Unlimited
    maxAgents: null, // Unlimited
    maxTeamMembers: null, // Unlimited
    retryAutomation: true,
    industryPackLimit: null,

    callingChannel: "DEDICATED",
    brochureUpload: true,

    dashboardTier: "CUSTOM",
    agentCapability: "CUSTOM",
    integrations: "CUSTOM",
    supportTier: "SLA",

    lowBalanceThreshold: 500000, // ₹5,000
    includedBalance: 0,
    bonusValidityDays: null,
  },
];

async function seedPlans() {
  console.log("🌱 Starting Plans & PlanVersion v1 seed...");

  for (const item of seedPlansData) {
    const plan = await prisma.plan.upsert({
      where: { slug: item.slug },
      create: {
        slug: item.slug,
        name: item.name,
        displayOrder: item.displayOrder,
        description: item.description,
        isActive: true,
      },
      update: {
        name: item.name,
        displayOrder: item.displayOrder,
        description: item.description,
        isActive: true,
      },
    });

    const versionData = {
      planId: plan.id,
      version: 1,
      status: "PUBLISHED" as const,
      currency: "INR",

      pricingModel: item.pricingModel,
      onboardingFee: item.onboardingFee,
      onboardingFeeOriginal: item.onboardingFeeOriginal,
      perMinuteRate: item.perMinuteRate,
      billingMinimumSec: item.billingMinimumSec,
      billingIncrementSec: item.billingIncrementSec,

      maxActiveCampaigns: item.maxActiveCampaigns,
      maxLeadsPerBatch: item.maxLeadsPerBatch,
      maxAgents: item.maxAgents,
      maxTeamMembers: item.maxTeamMembers,
      retryAutomation: item.retryAutomation,
      industryPackLimit: item.industryPackLimit,

      callingChannel: item.callingChannel,
      brochureUpload: item.brochureUpload,

      dashboardTier: item.dashboardTier,
      agentCapability: item.agentCapability,
      integrations: item.integrations,
      supportTier: item.supportTier,

      lowBalanceThreshold: item.lowBalanceThreshold,
      includedBalance: item.includedBalance,
      bonusValidityDays: item.bonusValidityDays,

      publishedAt: new Date(),
    };

    await prisma.planVersion.upsert({
      where: {
        planId_version: {
          planId: plan.id,
          version: 1,
        },
      },
      create: versionData,
      update: versionData,
    });

    console.log(`✓ Seeded Plan "${plan.name}" with published Version 1`);
  }

  console.log("\n✅ All Plans & Versions seeded successfully.");
}

seedPlans()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
