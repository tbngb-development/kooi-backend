-- AlterTable
ALTER TABLE "TenantInvite" ADD COLUMN     "creditIncludedBalance" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "discountPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "skipPayment" BOOLEAN NOT NULL DEFAULT false;
