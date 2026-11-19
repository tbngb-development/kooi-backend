import { describe, expect, it } from "vitest";
import {
  auditPendingMigrations,
  buildDeployPlan,
  DEPLOY_ENVIRONMENTS,
  DEPLOY_STEPS,
  findDestructiveStatements,
  findMissingMigrationSql,
  findPendingMigrations,
  parseAppliedMigrations,
  stripSqlComments,
} from "../../../../../scripts/deploy.mjs";

describe("deploy plan ordering", () => {
  it("keeps generate → build → migrate → reload → verify order with preflight first", () => {
    expect([...DEPLOY_STEPS]).toEqual([
      "preflight",
      "generate",
      "build",
      "migrate",
      "reload",
      "verify",
    ]);
  });

  it.each(Object.keys(DEPLOY_ENVIRONMENTS))(
    "enforces the safe order for %s and never migrates before building",
    (envName) => {
      const plan = buildDeployPlan(envName);
      expect(plan.map((s) => s.step)).toEqual([...DEPLOY_STEPS]);

      const indexOf = (step: string) => plan.findIndex((s) => s.step === step);
      expect(indexOf("generate")).toBeLessThan(indexOf("build"));
      expect(indexOf("build")).toBeLessThan(indexOf("migrate"));
      expect(indexOf("migrate")).toBeLessThan(indexOf("reload"));
      expect(indexOf("reload")).toBeLessThan(indexOf("verify"));
      expect(plan[indexOf("preflight")].argv).toBeNull();
      expect(plan[indexOf("migrate")].display).toContain("migrate deploy");
      expect(plan[indexOf("reload")].display).toContain("pm2 reload");
    },
  );

  it("rejects an unknown environment", () => {
    expect(() => buildDeployPlan("nope")).toThrow(/Unknown deploy environment/);
  });
});

describe("migration safety preflight", () => {
  it("strips comments before inspecting SQL", () => {
    expect(stripSqlComments("-- DROP TABLE x;\nSELECT 1; /* DROP COLUMN y */")).not.toContain(
      "DROP",
    );
  });

  it("allows additive, backfill and comment-only SQL", () => {
    for (const sql of [
      'ALTER TABLE "Wallet" ADD COLUMN "creditLimit" INTEGER NOT NULL DEFAULT 0;',
      'UPDATE "PlanVersion" SET "creditLimit" = 10000;',
      'CREATE TABLE "WalletIncidentState" (id TEXT NOT NULL);',
      '-- ALTER TABLE "Wallet" DROP COLUMN "x";',
      'CREATE INDEX idx_x ON "Wallet"("tenantId");',
    ]) {
      expect(findDestructiveStatements(sql)).toEqual([]);
    }
  });

  it.each([
    ['DROP TABLE "Wallet";', "DROP_TABLE"],
    ['ALTER TABLE "Wallet" DROP COLUMN "x";', "DROP_COLUMN"],
    ['DROP SCHEMA "public";', "DROP_SCHEMA"],
    ['ALTER TABLE "Wallet" RENAME COLUMN "x" TO "y";', "RENAME_COLUMN"],
    ['ALTER TABLE "Wallet" RENAME TO "WalletV2";', "RENAME_TABLE"],
    ['ALTER TABLE "Wallet" ALTER COLUMN "x" TYPE BIGINT;', "ALTER_COLUMN_TYPE"],
    ['TRUNCATE "Wallet";', "TRUNCATE"],
  ])("detects destructive statement %s as %s", (sql, code) => {
    expect(findDestructiveStatements(sql)).toContain(code as string);
  });

  it("parses applied migrations and diffs pending ones", () => {
    expect(parseAppliedMigrations("a\r\n b \n\n c")).toEqual(["a", "b", "c"]);
    expect(findPendingMigrations(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
  });

  it("flags migration folders with no migration.sql", () => {
    expect(findMissingMigrationSql(["good", "empty"], (name) => name === "good")).toEqual([
      "empty",
    ]);
  });

  it("flags unacknowledged destructive migrations but allows acknowledged ones", () => {
    const readSql = (name: string) =>
      name === "contract" ? 'DROP COLUMN "x";' : 'CREATE TABLE "y" (id TEXT);';

    expect(auditPendingMigrations(["additive"], readSql, [])).toEqual([]);
    expect(auditPendingMigrations(["contract"], readSql, [])).toEqual([
      { name: "contract", codes: ["DROP_COLUMN"] },
    ]);
    expect(auditPendingMigrations(["contract"], readSql, ["contract"])).toEqual([]);
  });
});
