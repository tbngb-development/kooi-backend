-- AlterTable
ALTER TABLE "BolnaApiKey" ADD COLUMN     "bolnaConcurrencyCurrent" INTEGER,
ADD COLUMN     "bolnaConcurrencyMax" INTEGER,
ADD COLUMN     "bolnaProfileEmail" TEXT,
ADD COLUMN     "bolnaProfileFetchedAt" TIMESTAMP(3),
ADD COLUMN     "bolnaProfileName" TEXT,
ADD COLUMN     "bolnaWalletBalance" DOUBLE PRECISION;
