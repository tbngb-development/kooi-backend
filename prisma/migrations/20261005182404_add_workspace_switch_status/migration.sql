-- CreateEnum
CREATE TYPE "WorkspaceSwitchStatus" AS ENUM ('IDLE', 'CLONING', 'FAILED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "workspaceSwitchError" TEXT,
ADD COLUMN     "workspaceSwitchJobId" TEXT,
ADD COLUMN     "workspaceSwitchStatus" "WorkspaceSwitchStatus" NOT NULL DEFAULT 'IDLE';
