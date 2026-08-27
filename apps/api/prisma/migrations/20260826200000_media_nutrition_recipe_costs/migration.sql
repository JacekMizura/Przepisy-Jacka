-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('product', 'recipe_cover', 'recipe_step');

-- CreateEnum
CREATE TYPE "MediaUploadStatus" AS ENUM ('pending', 'processing', 'ready', 'failed');

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "kitchenId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "purpose" "MediaPurpose" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "thumbnailObjectKey" TEXT,
    "mimeType" VARCHAR(100) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "status" "MediaUploadStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaAsset_kitchenId_purpose_idx" ON "MediaAsset"("kitchenId", "purpose");

-- CreateIndex
CREATE INDEX "MediaAsset_kitchenId_status_idx" ON "MediaAsset"("kitchenId", "status");

-- CreateIndex
CREATE INDEX "MediaAsset_uploadedByUserId_idx" ON "MediaAsset"("uploadedByUserId");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ProductNutrition" (
    "productId" TEXT NOT NULL,
    "baseQuantity" DECIMAL(12,3) NOT NULL,
    "baseUnit" "ProductUnit" NOT NULL,
    "kcal" DECIMAL(12,3) NOT NULL,
    "proteinGrams" DECIMAL(12,3) NOT NULL,
    "carbsGrams" DECIMAL(12,3) NOT NULL,
    "fatGrams" DECIMAL(12,3) NOT NULL,
    "fiberGrams" DECIMAL(12,3),
    "saltGrams" DECIMAL(12,3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductNutrition_pkey" PRIMARY KEY ("productId")
);

-- AddForeignKey
ALTER TABLE "ProductNutrition" ADD CONSTRAINT "ProductNutrition_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: legacy "imageUrl" pozostaje jako zapasowe źródło zdjęcia produktu.
ALTER TABLE "Product" ADD COLUMN "imageMediaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Product_imageMediaId_key" ON "Product"("imageMediaId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_imageMediaId_fkey" FOREIGN KEY ("imageMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN "coverMediaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_coverMediaId_key" ON "Recipe"("coverMediaId");

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "RecipeStep" ADD COLUMN "imageMediaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RecipeStep_imageMediaId_key" ON "RecipeStep"("imageMediaId");

-- AddForeignKey
ALTER TABLE "RecipeStep" ADD CONSTRAINT "RecipeStep_imageMediaId_fkey" FOREIGN KEY ("imageMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
