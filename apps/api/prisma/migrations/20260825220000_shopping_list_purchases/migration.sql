-- CreateEnum
CREATE TYPE "ShoppingListItemStatus" AS ENUM ('pending', 'bought', 'skipped');

-- CreateEnum
CREATE TYPE "ShoppingInputUnit" AS ENUM ('piece', 'gram', 'kilogram', 'milliliter', 'liter');

-- CreateTable
CREATE TABLE "ShoppingList" (
    "id" TEXT NOT NULL,
    "kitchenId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingListItem" (
    "id" TEXT NOT NULL,
    "shoppingListId" TEXT NOT NULL,
    "productId" TEXT,
    "customName" TEXT,
    "plannedQuantity" DECIMAL(12,3),
    "plannedUnit" "ShoppingInputUnit",
    "note" TEXT,
    "status" "ShoppingListItemStatus" NOT NULL DEFAULT 'pending',
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ShoppingListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "kitchenId" TEXT NOT NULL,
    "storeName" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'PLN',
    "totalPriceMinor" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseLineItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "stockItemId" TEXT,
    "shoppingListItemId" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "location" "StorageLocation" NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "displayName" TEXT,

    CONSTRAINT "PurchaseLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingList_kitchenId_key" ON "ShoppingList"("kitchenId");

-- CreateIndex
CREATE INDEX "ShoppingListItem_shoppingListId_status_idx" ON "ShoppingListItem"("shoppingListId", "status");

-- CreateIndex
CREATE INDEX "ShoppingListItem_shoppingListId_productId_idx" ON "ShoppingListItem"("shoppingListId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_idempotencyKey_key" ON "Purchase"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Purchase_kitchenId_purchasedAt_idx" ON "Purchase"("kitchenId", "purchasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseLineItem_stockItemId_key" ON "PurchaseLineItem"("stockItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseLineItem_shoppingListItemId_key" ON "PurchaseLineItem"("shoppingListItemId");

-- AddForeignKey
ALTER TABLE "ShoppingList" ADD CONSTRAINT "ShoppingList_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_shoppingListId_fkey" FOREIGN KEY ("shoppingListId") REFERENCES "ShoppingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLineItem" ADD CONSTRAINT "PurchaseLineItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLineItem" ADD CONSTRAINT "PurchaseLineItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLineItem" ADD CONSTRAINT "PurchaseLineItem_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLineItem" ADD CONSTRAINT "PurchaseLineItem_shoppingListItemId_fkey" FOREIGN KEY ("shoppingListItemId") REFERENCES "ShoppingListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Application-aligned CHECKs (Prisma does not emit these)
ALTER TABLE "Purchase"
  ADD CONSTRAINT "Purchase_totalPriceMinor_nonnegative_check"
  CHECK ("totalPriceMinor" >= 0);

ALTER TABLE "Purchase"
  ADD CONSTRAINT "Purchase_currency_iso_check"
  CHECK (char_length("currency") = 3);

ALTER TABLE "PurchaseLineItem"
  ADD CONSTRAINT "PurchaseLineItem_quantity_positive_check"
  CHECK ("quantity" > 0);

ALTER TABLE "PurchaseLineItem"
  ADD CONSTRAINT "PurchaseLineItem_priceMinor_nonnegative_check"
  CHECK ("priceMinor" >= 0);
