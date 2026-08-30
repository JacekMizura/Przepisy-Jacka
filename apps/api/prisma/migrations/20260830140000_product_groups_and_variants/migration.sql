-- CreateEnum
CREATE TYPE "PackageContentUnit" AS ENUM ('piece', 'gram', 'kilogram', 'milliliter', 'liter');

-- CreateTable
CREATE TABLE "ProductGroup" (
    "id" TEXT NOT NULL,
    "kitchenId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductGroup_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "groupId" TEXT,
ADD COLUMN "brand" VARCHAR(120),
ADD COLUMN "variantLabel" VARCHAR(80),
ADD COLUMN "packageQuantity" DECIMAL(12,3),
ADD COLUMN "packageUnit" "PackageContentUnit";

-- CreateIndex
CREATE UNIQUE INDEX "ProductGroup_kitchenId_normalizedName_key" ON "ProductGroup"("kitchenId", "normalizedName");

-- CreateIndex
CREATE INDEX "ProductGroup_kitchenId_idx" ON "ProductGroup"("kitchenId");

-- CreateIndex
CREATE INDEX "Product_kitchenId_groupId_idx" ON "Product"("kitchenId", "groupId");

-- CreateIndex
CREATE INDEX "Product_kitchenId_brand_idx" ON "Product"("kitchenId", "brand");

-- AddForeignKey
ALTER TABLE "ProductGroup" ADD CONSTRAINT "ProductGroup_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (SetNull on group delete — products stay)
ALTER TABLE "Product" ADD CONSTRAINT "Product_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
