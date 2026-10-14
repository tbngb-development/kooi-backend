-- CreateEnum
CREATE TYPE "PlatformAgentType" AS ENUM ('OUTBOUND', 'INBOUND', 'BOTH');

-- AlterTable
ALTER TABLE "PlatformAgent" ADD COLUMN "type" "PlatformAgentType" NOT NULL DEFAULT 'OUTBOUND';

-- CreateIndex
CREATE INDEX "PlatformAgent_type_idx" ON "PlatformAgent"("type");
