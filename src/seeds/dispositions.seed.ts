import { Prisma } from "@prisma/client";
import prisma from "../shared/config/database/prisma";
import { createLogger } from "../shared/config/logging/winston.logger";
import { dispositionsSeedData } from "./data/dispositions.data";

const logger = createLogger().child({ module: "seed", seed: "dispositions" });

async function seedDispositions(): Promise<void> {
  logger.info("Starting Dispositions seed", {
    action: "seed.dispositions.start",
    total: dispositionsSeedData.length,
  });

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const item of dispositionsSeedData) {
    try {
      const existing = await prisma.extractionDisposition.findUnique({
        where: { slug: item.slug },
        select: { id: true },
      });

      const data: Prisma.ExtractionDispositionCreateInput = {
        slug: item.slug,
        name: item.name,
        displayName: item.displayName,
        tag: item.tag,
        question: item.question,
        systemPrompt: item.systemPrompt,
        model: item.model,
        isSubjective: item.isSubjective,
        isObjective: item.isObjective,
        subjectiveType: item.subjectiveType,
        subjectiveTypeConfig: item.subjectiveTypeConfig
          ? (item.subjectiveTypeConfig as Prisma.InputJsonValue)
          : Prisma.DbNull,
        objectiveOptions: item.objectiveOptions
          ? (item.objectiveOptions as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
        description: item.description,
        isActive: item.isActive,
        showInOverview: item.showInOverview,
        showInInsights: item.showInInsights,
      };

      await prisma.extractionDisposition.upsert({
        where: { slug: item.slug },
        create: data,
        update: data,
      });

      if (existing) {
        updated++;
        logger.debug("Disposition updated", {
          action: "seed.dispositions.updated",
          slug: item.slug,
          displayName: item.displayName,
        });
      } else {
        created++;
        logger.info("Disposition created", {
          action: "seed.dispositions.created",
          slug: item.slug,
          displayName: item.displayName,
        });
      }
    } catch (err) {
      failed++;
      logger.error("Disposition seed failed", err, {
        action: "seed.dispositions.failed",
        slug: item.slug,
      });
    }
  }

  logger.info("Dispositions seed complete", {
    action: "seed.dispositions.complete",
    total: dispositionsSeedData.length,
    created,
    updated,
    failed,
  });

  if (failed > 0) {
    throw new Error(`${failed} disposition(s) failed to seed`);
  }
}

seedDispositions()
  .catch((err) => {
    logger.error("Dispositions seed script failed", err, {
      action: "seed.dispositions.script_failed",
    });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
