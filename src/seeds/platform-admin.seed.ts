import prisma from "../shared/config/database/prisma";
import { BcryptPasswordService } from "../modules/auth/infrastructure/services/bcrypt-password.service";
import { validatePasswordStrength } from "../modules/auth/domain/rules/password.rules";
import { createLogger } from "../shared/config/logging/winston.logger";

const logger = createLogger().child({ module: "seed", seed: "platform-admin" });

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

  logger.info("Starting platform admin seed", {
    action: "seed.platform_admin.start",
    email: args.email,
  });

  const validation = validatePasswordStrength(args.password);
  if (!validation.isValid) {
    logger.error("Password validation failed", undefined, {
      action: "seed.platform_admin.password_invalid",
      errors: validation.errors,
    });
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
      logger.info("User is already a platform admin", {
        action: "seed.platform_admin.already_exists",
        userId: existing.id,
        email: args.email,
      });
      return;
    }
    const admin = await prisma.platformAdmin.create({
      data: { userId: existing.id },
    });
    logger.info("Existing user promoted to platform admin", {
      action: "seed.platform_admin.promoted",
      userId: existing.id,
      adminId: admin.id,
      email: args.email,
    });
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

  logger.info("Platform admin created", {
    action: "seed.platform_admin.created",
    userId: result.user.id,
    adminId: result.admin.id,
    email: result.user.email,
  });
}

main()
  .catch((err) => {
    logger.error("Platform admin seed script failed", err, {
      action: "seed.platform_admin.script_failed",
    });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
