#!/usr/bin/env node
/**
 * Single ordered deploy runner for KOOI backend (production + staging).
 *
 * Fixed step order: preflight -> generate -> build -> migrate -> reload -> verify
 *
 * Do not reorder. Rationale:
 *  - generate/build finish BEFORE migrate so the code that understands the new
 *    schema is compiled and ready before the database changes.
 *  - migrate finishes BEFORE pm2 reload so no instance boots against a
 *    half-migrated database.
 *  - preflight rejects destructive migrations (expand/contract required) and
 *    empty migration folders. Additive-only migrations are tolerated by the
 *    previous code during a rolling reload; dropped/renamed columns are not.
 *
 * Usage (on the host, from the release directory):
 *   node scripts/deploy.mjs --env production
 *   node scripts/deploy.mjs --env staging
 *   node scripts/deploy.mjs --env production --dry-run   # prints plan only
 *   node scripts/deploy.mjs --self-check                 # verifies this guard
 *
 * This script is never executed by CI or by the test suite against a real host;
 * --dry-run and --self-check perform no database, PM2 or network actions.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "prisma", "migrations");
const ACK_FILE = path.join(MIGRATIONS_DIR, "destructive-acknowledged.json");

/** The only supported order. Regression-tested via --self-check. */
export const DEPLOY_STEPS = Object.freeze([
  "preflight",
  "generate",
  "build",
  "migrate",
  "reload",
  "verify",
]);

export const DEPLOY_ENVIRONMENTS = Object.freeze({
  production: Object.freeze({
    releaseDir: "/srv/apps/kooi/current",
    pm2Name: "kooi-api",
    healthUrl: "https://api.kooi.in/api/health",
  }),
  staging: Object.freeze({
    releaseDir: "/srv/apps/kooi-staging/current",
    pm2Name: "kooi-api-staging",
    healthUrl: "http://stagin.api.kooi.in/api/health",
  }),
});

export function getEnvConfig(envName) {
  const cfg = DEPLOY_ENVIRONMENTS[envName];
  if (!cfg) {
    throw new Error(
      `Unknown deploy environment "${envName}". Use --env production or --env staging.`,
    );
  }
  return cfg;
}

/**
 * Builds the ordered plan. `argv: null` marks the internal preflight step;
 * every other step is executed verbatim via spawnSync.
 */
export function buildDeployPlan(envName) {
  const cfg = getEnvConfig(envName);
  return [
    {
      step: "preflight",
      argv: null,
      display: "migration safety preflight (internal)",
    },
    {
      step: "generate",
      argv: ["npx", "prisma", "generate"],
      display: "npx prisma generate",
    },
    {
      step: "build",
      argv: ["npm", "run", "build"],
      display: "npm run build",
    },
    {
      step: "migrate",
      argv: ["npx", "prisma", "migrate", "deploy"],
      display: "npx prisma migrate deploy",
    },
    {
      step: "reload",
      argv: ["pm2", "reload", cfg.pm2Name],
      display: `pm2 reload ${cfg.pm2Name}`,
    },
    {
      step: "verify",
      argv: [
        "curl",
        "--fail",
        "--silent",
        "--show-error",
        "--retry",
        "5",
        "--retry-delay",
        "2",
        cfg.healthUrl,
      ],
      display: `curl --fail --retry 5 ${cfg.healthUrl}`,
    },
  ];
}

/** SQL that can break a previous code version during a rolling reload. */
const DESTRUCTIVE_PATTERNS = Object.freeze([
  ["DROP_TABLE", /\bDROP\s+TABLE\b/i],
  ["DROP_COLUMN", /\bDROP\s+COLUMN\b/i],
  ["DROP_SCHEMA", /\bDROP\s+SCHEMA\b/i],
  ["RENAME_COLUMN", /\bRENAME\s+COLUMN\b/i],
  ["RENAME_TABLE", /\bALTER\s+TABLE\b[\s\S]*?\bRENAME\s+TO\b/i],
  ["ALTER_COLUMN_TYPE", /\bALTER\s+COLUMN\b[\s\S]*?\bTYPE\b/i],
  ["TRUNCATE", /\bTRUNCATE\b/i],
]);

/** Strip SQL comments so commented-out DDL never trips the guard. */
export function stripSqlComments(sql) {
  return String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

export function findDestructiveStatements(sql) {
  const clean = stripSqlComments(sql);
  return DESTRUCTIVE_PATTERNS.filter(([, re]) => re.test(clean)).map(
    ([code]) => code,
  );
}

/** Parse `psql -Atc` output into applied migration names. */
export function parseAppliedMigrations(output) {
  return String(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function findPendingMigrations(localNames, appliedNames) {
  const applied = new Set(appliedNames);
  return localNames.filter((name) => !applied.has(name));
}

/** Local migration folders that are missing migration.sql (Prisma deploy blocker). */
export function findMissingMigrationSql(localNames, hasSql) {
  return localNames.filter((name) => !hasSql(name));
}

/**
 * Returns pending migrations that contain destructive SQL but have not been
 * explicitly acknowledged under the documented expand/contract procedure.
 */
export function auditPendingMigrations(
  pendingNames,
  readSql,
  acknowledgedNames = [],
) {
  const acknowledged = new Set(acknowledgedNames);
  const findings = [];
  for (const name of pendingNames) {
    const codes = findDestructiveStatements(readSql(name));
    if (codes.length > 0 && !acknowledged.has(name)) {
      findings.push({ name, codes });
    }
  }
  return findings;
}

export function loadAcknowledgedDestructive() {
  if (!existsSync(ACK_FILE)) return [];
  const parsed = JSON.parse(readFileSync(ACK_FILE, "utf8"));
  return Array.isArray(parsed.acknowledged) ? parsed.acknowledged : [];
}

function localMigrationNames() {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function migrationSql(name) {
  return readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
}

function hasMigrationSql(name) {
  return existsSync(path.join(MIGRATIONS_DIR, name, "migration.sql"));
}

function fetchAppliedMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set; run from the release directory with .env linked.");
  }
  const result = spawnSync(
    "psql",
    [
      databaseUrl,
      "-Atc",
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name;",
    ],
    { encoding: "utf8" },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `Migration preflight query failed: ${result.stderr?.trim() || result.error?.message || `exit ${result.status}`}`,
    );
  }
  return parseAppliedMigrations(result.stdout);
}

function runPreflight() {
  if (!existsSync(path.join(REPO_ROOT, ".env"))) {
    throw new Error("Missing .env symlink; link /srv/apps/kooi*/shared/.env before deploying.");
  }

  const local = localMigrationNames();
  const missingSql = findMissingMigrationSql(local, hasMigrationSql);
  if (missingSql.length > 0) {
    throw new Error(
      `Migration folder(s) without migration.sql: ${missingSql.join(", ")}. Complete or remove them before deploy.`,
    );
  }

  const applied = fetchAppliedMigrations();
  const pending = findPendingMigrations(local, applied);
  const findings = auditPendingMigrations(
    pending,
    migrationSql,
    loadAcknowledgedDestructive(),
  );

  if (findings.length > 0) {
    const detail = findings
      .map((f) => `  - ${f.name}: ${f.codes.join(", ")}`)
      .join("\n");
    throw new Error(
      `Destructive pending migration(s) require an expand/contract deploy:\n${detail}\n` +
        `Split the change into additive + cleanup deploys, or record the reviewed name in ` +
        `prisma/migrations/destructive-acknowledged.json before re-running.`,
    );
  }

  console.log(
    `[preflight] OK — ${pending.length} pending migration(s), none destructive.`,
  );
}

/** First-time bootstrap has no PM2 process yet; reload/verify are skipped. */
function pm2ProcessExists(name) {
  const result = spawnSync("pm2", ["describe", name], { encoding: "utf8" });
  return result.status === 0;
}

function runStep(step) {
  console.log(`\n=== [${step.step}] ${step.display} ===`);
  const result = spawnSync(step.argv[0], step.argv.slice(1), {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Step "${step.step}" failed with exit code ${result.status}. Deploy stopped.`);
  }
}

function printPlan(plan, dryRun) {
  console.log(`Deploy order (${dryRun ? "DRY RUN — no actions" : "live"}):`);
  plan.forEach((step, index) => {
    console.log(`  ${index + 1}. ${step.step.padEnd(9)} ${step.display}`);
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(`self-check failed: ${message}`);
}

/** Deterministic verification of the guard logic — no DB, PM2 or network. */
export function selfCheck() {
  assert(
    JSON.stringify([...DEPLOY_STEPS]) ===
      JSON.stringify(["preflight", "generate", "build", "migrate", "reload", "verify"]),
    "deploy step order changed",
  );

  for (const envName of Object.keys(DEPLOY_ENVIRONMENTS)) {
    const plan = buildDeployPlan(envName);
    assert(
      JSON.stringify(plan.map((s) => s.step)) === JSON.stringify([...DEPLOY_STEPS]),
      `plan order for ${envName}`,
    );
    const idx = (name) => plan.findIndex((s) => s.step === name);
    assert(idx("build") < idx("migrate"), "build must precede migrate");
    assert(idx("migrate") < idx("reload"), "migrate must precede reload");
    assert(idx("generate") < idx("build"), "generate must precede build");
    assert(plan.find((s) => s.step === "preflight").argv === null, "preflight is internal");
  }

  assert(
    findDestructiveStatements('ALTER TABLE "Wallet" ADD COLUMN "x" INTEGER;').length === 0,
    "additive column must be allowed",
  );
  assert(
    findDestructiveStatements('UPDATE "Wallet" SET "x" = 1;').length === 0,
    "data backfill must be allowed",
  );
  assert(
    findDestructiveStatements('-- DROP TABLE "Wallet";\nSELECT 1;').length === 0,
    "commented DDL must be ignored",
  );
  for (const [sql, code] of [
    ['DROP TABLE "Wallet";', "DROP_TABLE"],
    ['ALTER TABLE "Wallet" DROP COLUMN "x";', "DROP_COLUMN"],
    ['ALTER TABLE "Wallet" ALTER COLUMN "x" TYPE BIGINT;', "ALTER_COLUMN_TYPE"],
    ['ALTER TABLE "Wallet" RENAME COLUMN "x" TO "y";', "RENAME_COLUMN"],
    ['TRUNCATE "Wallet";', "TRUNCATE"],
  ]) {
    assert(findDestructiveStatements(sql).includes(code), `${code} must be detected`);
  }

  assert(
    JSON.stringify(parseAppliedMigrations("a\r\n b \n\n c")) === JSON.stringify(["a", "b", "c"]),
    "applied migration parsing",
  );
  assert(
    JSON.stringify(findPendingMigrations(["a", "b", "c"], ["a", "c"])) === JSON.stringify(["b"]),
    "pending migration diff",
  );
  assert(
    JSON.stringify(findMissingMigrationSql(["a", "b"], (n) => n === "a")) === JSON.stringify(["b"]),
    "empty migration folder detection",
  );

  const read = (name) => (name === "bad" ? 'DROP TABLE "x";' : 'CREATE TABLE "y" (id TEXT);');
  assert(auditPendingMigrations(["good"], read, []).length === 0, "additive migration passes");
  assert(auditPendingMigrations(["bad"], read, []).length === 1, "destructive migration flagged");
  assert(
    auditPendingMigrations(["bad"], read, ["bad"]).length === 0,
    "acknowledged destructive migration passes",
  );

  console.log("self-check OK");
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-check")) {
    selfCheck();
    return;
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      "Usage: node scripts/deploy.mjs --env production|staging [--dry-run] | --self-check",
    );
    return;
  }

  const envIndex = argv.indexOf("--env");
  const envName = envIndex >= 0 ? argv[envIndex + 1] : undefined;
  const cfg = getEnvConfig(envName);
  const dryRun = argv.includes("--dry-run");
  const plan = buildDeployPlan(envName);

  console.log(`Target: ${envName} (${cfg.releaseDir})`);
  printPlan(plan, dryRun);

  if (dryRun) {
    console.log("\nDry run complete. No database, PM2 or network action performed.");
    return;
  }

  runPreflight();
  const processRunning = pm2ProcessExists(cfg.pm2Name);
  for (const step of plan.slice(1)) {
    if (
      !processRunning &&
      (step.step === "reload" || step.step === "verify")
    ) {
      console.log(
        `\n=== [${step.step}] skipped — ${cfg.pm2Name} is not running yet (first-time bootstrap) ===`,
      );
      continue;
    }
    runStep(step);
  }
  console.log("\nDeploy complete.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
