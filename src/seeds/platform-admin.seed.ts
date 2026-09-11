/**
 * Seed a platform admin user.
 *
 * Usage:
 *  npx tsx src/seeds/platform-admin.seed.ts --email admin@kooi.in --password "Str0ngPass" --name "Platform Admin"
 */

import prisma from "../shared/config/database/prisma";
import { BcryptPasswordService } from "../modules/auth/infrastructure/services/bcrypt-password.service";
import { validatePasswordStrength } from "../modules/auth/domain/rules/password.rules";

interface SeedArgs {
  email: string;
  password: string;
  name: string;
}

function parseArgs(): SeedArgs {
  const args = process.argv.slice(2);
  const result: Partial<SeedArgs> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    const value = args[i + 1];
    if (key === "email") result.email = value;
    if (key === "password") result.password = value;
    if (key === "name") result.name = value;
  }

  if (!result.email || !result.password || !result.name) {
    throw new Error("Missing required arguments: --email, --password, --name");
  }

  return result as SeedArgs;
}

async function main(): Promise<void> {
  const args = parseArgs();

  const validation = validatePasswordStrength(args.password);
  if (!validation.isValid) {
    console.error("❌ Password validation failed:");
    validation.errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  const passwordService = new BcryptPasswordService();
  const passwordHash = await passwordService.hash(args.password);

  const existing = await prisma.user.findUnique({
    where: { email: args.email },
    include: { platformAdmin: true },
  });

  if (existing) {
    if (existing.platformAdmin) {
      console.log(
        `✓ User ${args.email} is already a platform admin (id: ${existing.id})`,
      );
      return;
    }
    await prisma.platformAdmin.create({
      data: { userId: existing.id },
    });
    console.log(`✓ Promoted existing user ${args.email} to platform admin`);
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: args.email,
        password: passwordHash,
        name: args.name,
        isActive: true,
      },
    });

    const admin = await tx.platformAdmin.create({
      data: { userId: user.id },
    });

    return { user, admin };
  });

  console.log(`✓ Platform admin created`);
  console.log(`  User ID:   ${result.user.id}`);
  console.log(`  Admin ID:  ${result.admin.id}`);
  console.log(`  Email:     ${result.user.email}`);
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
