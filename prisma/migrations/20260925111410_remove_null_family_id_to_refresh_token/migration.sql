/*
  Warnings:

  - Made the column `familyId` on table `RefreshToken` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "RefreshToken" ALTER COLUMN "familyId" SET NOT NULL;
