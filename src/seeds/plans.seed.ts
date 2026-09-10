import prisma from "../shared/config/database/prisma";

async function seedPlans() {
  const plans = [
    {
      slug: "launch",
      name: "Launch",
      displayOrder: 1,

      pricingModel: "STANDARD" as const,
      onboardingFee: 999900,
      onboardingFeeOriginal: 4999900,
      perMinuteRate: 1200,
      billingMinimumSec: 30,
      billingIncrementSec: 15,

      maxActiveCampaigns: 1,
      maxLeadsPerBatch: 10000,
      maxAgents: 1,
      maxTeamMembers: 2,
      retryAutomation: false,
      industryPackLimit: 1,

      callingChannel: "SHARED" as const,
      brochureUpload: false,

      dashboardTier: "BASIC" as const,
      agentCapability: "BASIC" as const,
      integrations: "NONE" as const,
      supportTier: "STANDARD" as const,

      lowBalanceThreshold: 10000,
      includedBalance: 50000,
      bonusValidityDays: 5,
    },
    {
      slug: "growth",
      name: "Growth",
      displayOrder: 2,

      pricingModel: "STANDARD" as const,
      onboardingFee: 1999900,
      onboardingFeeOriginal: 9999900,
      perMinuteRate: 1000,
      billingMinimumSec: 30,
      billingIncrementSec: 15,

      maxActiveCampaigns: 2,
      maxLeadsPerBatch: 10000,
      maxAgents: 2,
      maxTeamMembers: 5,
      retryAutomation: true,
      industryPackLimit: 1,

      callingChannel: "SHARED" as const,
      brochureUpload: false,

      dashboardTier: "STANDARD" as const,
      agentCapability: "BASIC_KNOWLEDGE" as const,
      integrations: "BASIC" as const,
      supportTier: "STANDARD" as const,

      lowBalanceThreshold: 20000,
      includedBalance: 200000,
      bonusValidityDays: 10,
    },
    {
      slug: "scale",
      name: "Scale",
      displayOrder: 3,

      pricingModel: "STANDARD" as const,
      onboardingFee: 4999900,
      onboardingFeeOriginal: 19999900,
      perMinuteRate: 800,
      billingMinimumSec: 30,
      billingIncrementSec: 15,

      maxActiveCampaigns: 5,
      maxLeadsPerBatch: 10000,
      maxAgents: 5,
      maxTeamMembers: 10,
      retryAutomation: true,
      industryPackLimit: 2,

      callingChannel: "DEDICATED_WITH_NUMBER" as const,
      brochureUpload: true,

      dashboardTier: "ADVANCED" as const,
      agentCapability: "ADVANCED_KNOWLEDGE" as const,
      integrations: "API_SELECTED" as const,
      supportTier: "PRIORITY" as const,

      lowBalanceThreshold: 50000,
      includedBalance: 500000,
      bonusValidityDays: 15,
    },
    {
      slug: "enterprise",
      name: "Enterprise",
      displayOrder: 4,

      pricingModel: "CUSTOM" as const,
      onboardingFee: 0,
      onboardingFeeOriginal: null,
      perMinuteRate: 600,
      billingMinimumSec: 30,
      billingIncrementSec: 15,

      maxActiveCampaigns: null,
      maxLeadsPerBatch: null,
      maxAgents: null,
      maxTeamMembers: null,
      retryAutomation: true,
      industryPackLimit: null,

      callingChannel: "DEDICATED" as const,
      brochureUpload: true,

      dashboardTier: "CUSTOM" as const,
      agentCapability: "CUSTOM" as const,
      integrations: "CUSTOM" as const,
      supportTier: "SLA" as const,

      lowBalanceThreshold: 500000,
      includedBalance: 0,
      bonusValidityDays: null,
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      create: plan,
      update: plan,
    });
    console.log(`✓ Seeded plan: ${plan.name}`);
  }

  console.log("\n✅ Plans seeded successfully");
}

seedPlans()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
