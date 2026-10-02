/*
  Warnings:

  - You are about to drop the `PlatformAgentDisposition` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PlatformAgentDisposition" DROP CONSTRAINT "PlatformAgentDisposition_dispositionId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformAgentDisposition" DROP CONSTRAINT "PlatformAgentDisposition_platformAgentId_fkey";

-- DropTable
DROP TABLE "PlatformAgentDisposition";
