-- CreateEnum
CREATE TYPE "NutritionDataSource" AS ENUM ('manual', 'open_food_facts');

-- AlterTable
ALTER TABLE "ProductNutrition" ADD COLUMN "source" "NutritionDataSource" NOT NULL DEFAULT 'manual';
ALTER TABLE "ProductNutrition" ADD COLUMN "sourceFetchedAt" TIMESTAMP(3);
ALTER TABLE "ProductNutrition" ADD COLUMN "sourceLabel" VARCHAR(200);
ALTER TABLE "ProductNutrition" ADD COLUMN "sourceBrand" VARCHAR(200);

-- CreateTable
CREATE TABLE "OpenFoodFactsCache" (
    "ean" VARCHAR(14) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenFoodFactsCache_pkey" PRIMARY KEY ("ean")
);

-- CreateIndex
CREATE INDEX "OpenFoodFactsCache_expiresAt_idx" ON "OpenFoodFactsCache"("expiresAt");
