-- U-01: expand/backfill/contract rename of lowBalanceThreshold -> creditLimit.
-- The old column is intentionally retained for one release (D-06); do not drop
-- it here. creditLimit is backfilled in place from the old value.
-- warningThreshold is a fixed plan-level value (D-05), not a tenant override.

ALTER TABLE "PlanVersion" ADD COLUMN "creditLimit" INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE "PlanVersion" ADD COLUMN "warningThreshold" INTEGER NOT NULL DEFAULT 50000;

UPDATE "PlanVersion" SET "creditLimit" = "lowBalanceThreshold";
