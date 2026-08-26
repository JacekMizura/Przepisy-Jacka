-- AlterTable RecipeStep
ALTER TABLE "RecipeStep" ADD COLUMN "title" TEXT;
ALTER TABLE "RecipeStep" ADD COLUMN "durationMinutes" INTEGER;

-- AlterTable ShoppingListItem
ALTER TABLE "ShoppingListItem" ADD COLUMN "requiredQuantity" DECIMAL(12,3);
ALTER TABLE "ShoppingListItem" ADD COLUMN "requiredUnit" "ShoppingInputUnit";
ALTER TABLE "ShoppingListItem" ADD COLUMN "sourceRecipeId" TEXT;
ALTER TABLE "ShoppingListItem" ADD COLUMN "sourceRecipeName" TEXT;
ALTER TABLE "ShoppingListItem" ADD COLUMN "purchaseOptionId" TEXT;
ALTER TABLE "ShoppingListItem" ADD COLUMN "packageCount" INTEGER;

-- CreateTable
CREATE TABLE "ProductPurchaseOption" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentQuantity" DECIMAL(12,3) NOT NULL,
    "contentUnit" "ProductUnit" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPurchaseOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPurchaseOption_productId_isActive_idx" ON "ProductPurchaseOption"("productId", "isActive");

-- Exactly one default purchase option per product
CREATE UNIQUE INDEX "ProductPurchaseOption_productId_default_uidx"
ON "ProductPurchaseOption"("productId")
WHERE "isDefault" = true;

-- CreateIndex
CREATE INDEX "ShoppingListItem_purchaseOptionId_idx" ON "ShoppingListItem"("purchaseOptionId");

-- CreateIndex
CREATE INDEX "ShoppingListItem_sourceRecipeId_idx" ON "ShoppingListItem"("sourceRecipeId");

-- AddForeignKey
ALTER TABLE "ProductPurchaseOption" ADD CONSTRAINT "ProductPurchaseOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_purchaseOptionId_fkey" FOREIGN KEY ("purchaseOptionId") REFERENCES "ProductPurchaseOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_sourceRecipeId_fkey" FOREIGN KEY ("sourceRecipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
