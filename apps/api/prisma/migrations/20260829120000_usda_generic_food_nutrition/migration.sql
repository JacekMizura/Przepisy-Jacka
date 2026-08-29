-- AlterEnum (idempotent for local/dev re-runs)
ALTER TYPE "NutritionDataSource" ADD VALUE IF NOT EXISTS 'usda_fdc';

-- AlterTable
ALTER TABLE "ProductNutrition" ADD COLUMN IF NOT EXISTS "sourceGenericFoodId" TEXT;
ALTER TABLE "ProductNutrition" ADD COLUMN IF NOT EXISTS "sourceFdcId" INTEGER;
ALTER TABLE "ProductNutrition" ADD COLUMN IF NOT EXISTS "sourcePieceGrams" DECIMAL(12,3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UsdaFoodCatalogEntry" (
    "id" TEXT NOT NULL,
    "fdcId" INTEGER NOT NULL,
    "polishName" TEXT NOT NULL,
    "polishNameNormalized" TEXT NOT NULL,
    "aliases" JSONB NOT NULL,
    "searchText" TEXT NOT NULL,
    "descriptionOriginal" TEXT NOT NULL,
    "variantLabel" TEXT NOT NULL,
    "dataType" VARCHAR(32) NOT NULL,
    "category" TEXT,
    "compositionMayVary" BOOLEAN NOT NULL DEFAULT false,
    "basisLabel" TEXT NOT NULL DEFAULT '100 g części jadalnej',
    "sourceDataset" TEXT NOT NULL,
    "sourceRelease" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "catalogVersion" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL,
    "publicationDate" TEXT,
    "kcal" DECIMAL(12,3) NOT NULL,
    "proteinGrams" DECIMAL(12,3) NOT NULL,
    "carbsGrams" DECIMAL(12,3) NOT NULL,
    "fatGrams" DECIMAL(12,3) NOT NULL,
    "fiberGrams" DECIMAL(12,3),
    "saltGrams" DECIMAL(12,3),
    "sodiumMg" DECIMAL(12,3),
    "energyField" TEXT NOT NULL,
    "carbsMethod" TEXT,
    "carbsApproximate" BOOLEAN NOT NULL DEFAULT false,
    "mappingWarnings" JSONB,

    CONSTRAINT "UsdaFoodCatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UsdaFoodCatalogEntry_fdcId_key" ON "UsdaFoodCatalogEntry"("fdcId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UsdaFoodCatalogEntry_polishNameNormalized_idx" ON "UsdaFoodCatalogEntry"("polishNameNormalized");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UsdaFoodCatalogEntry_searchText_idx" ON "UsdaFoodCatalogEntry"("searchText");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UsdaFoodCatalogEntry_catalogVersion_idx" ON "UsdaFoodCatalogEntry"("catalogVersion");
