-- AlterTable
ALTER TABLE "SarvamAgent" ADD COLUMN "connectionConfigs" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "SarvamAgent" ADD COLUMN "retryConfig" JSONB NOT NULL DEFAULT '{"max_retries":0}';

