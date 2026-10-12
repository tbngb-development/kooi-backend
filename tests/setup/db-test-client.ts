import prisma from "../../src/shared/config/database/prisma";

/**
 * Truncates all user tables in the test database.
 * Safety check: Fails immediately if DATABASE_URL does not contain "test".
 */
export async function clearTestDatabase(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl.includes("test")) {
    throw new Error(
      `[SAFETY ABORT] Refusing to clear database: DATABASE_URL does not contain 'test' (${dbUrl})`,
    );
  }

  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
      AND tablename NOT LIKE '_prisma%';
  `;

  if (tables.length === 0) return;

  const truncateStatements = tables
    .map((t) => `"public"."${t.tablename}"`)
    .join(", ");

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${truncateStatements} CASCADE;`,
  );
}

export async function disconnectTestDatabase(): Promise<void> {
  await prisma.$disconnect();
}
