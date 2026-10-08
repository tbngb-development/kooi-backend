import prisma from "../shared/config/database/prisma";
import { classifierDispositionsSeedData } from "./data/classifier-dispositions.data";

export async function seedClassifierDispositions(): Promise<void> {
  console.log("🌱 Seeding classifier dispositions...");

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const seed of classifierDispositionsSeedData) {
    // Resolve industry pack ID from slug if specified
    let industryPackId: string | null = null;

    if (seed.industryPackSlug) {
      const pack = await prisma.industryPack.findUnique({
        where: { slug: seed.industryPackSlug },
        select: { id: true },
      });

      if (!pack) {
        console.warn(
          `⚠️  Skipping "${seed.slug}" — industry pack "${seed.industryPackSlug}" not found. Seed industry packs first.`,
        );
        skipped++;
        continue;
      }

      industryPackId = pack.id;
    }

    // Upsert by composite unique key (slug + industryPackId)
    const existing = await prisma.classifierDisposition.findUnique({
      where: {
        slug_industryPackId: {
          slug: seed.slug,
          industryPackId: industryPackId ?? "",
        },
      },
    });

    if (existing) {
      await prisma.classifierDisposition.update({
        where: { id: existing.id },
        data: {
          name: seed.name,
          displayName: seed.displayName,
          question: seed.question,
          questionType: seed.questionType,
          objectiveOptions: seed.objectiveOptions as any,
          isActive: seed.isActive,
        },
      });
      updated++;
      console.log(`  ✓ Updated: ${seed.slug} (${seed.industryPackSlug ?? "general"})`);
    } else {
      await prisma.classifierDisposition.create({
        data: {
          slug: seed.slug,
          name: seed.name,
          displayName: seed.displayName,
          question: seed.question,
          questionType: seed.questionType,
          objectiveOptions: seed.objectiveOptions as any,
          industryPackId,
          isActive: seed.isActive,
        },
      });
      created++;
      console.log(`  ✓ Created: ${seed.slug} (${seed.industryPackSlug ?? "general"})`);
    }
  }

  console.log(
    `\n✅ Classifier dispositions seeded: ${created} created, ${updated} updated, ${skipped} skipped\n`,
  );
}

// Run directly
if (require.main === module) {
  seedClassifierDispositions()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Classifier disposition seeding failed:", err);
      process.exit(1);
    });
}