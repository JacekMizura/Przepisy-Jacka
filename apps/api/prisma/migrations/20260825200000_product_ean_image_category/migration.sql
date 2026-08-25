-- AlterTable
ALTER TABLE "Product" ADD COLUMN "ean" VARCHAR(14),
ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "category" VARCHAR(80);

-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN "ean" VARCHAR(14),
ADD COLUMN "imageUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Product_kitchenId_ean_key" ON "Product"("kitchenId", "ean");

-- CreateIndex
CREATE INDEX "Product_kitchenId_category_idx" ON "Product"("kitchenId", "category");
