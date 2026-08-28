-- AlterTable
ALTER TABLE "StockItem" ALTER COLUMN "purchasePriceMinor" DROP NOT NULL;

-- CreateTable
CREATE TABLE "StockConsumption" (
    "id" TEXT NOT NULL,
    "kitchenId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "totalQuantity" DECIMAL(12,3) NOT NULL,
    "totalCostMinor" INTEGER,
    "costComplete" BOOLEAN NOT NULL DEFAULT false,
    "previewFingerprint" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversesConsumptionId" TEXT,

    CONSTRAINT "StockConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockConsumptionLine" (
    "id" TEXT NOT NULL,
    "consumptionId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "costMinor" INTEGER,

    CONSTRAINT "StockConsumptionLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockConsumption_idempotencyKey_key" ON "StockConsumption"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "StockConsumption_reversesConsumptionId_key" ON "StockConsumption"("reversesConsumptionId");

-- CreateIndex
CREATE INDEX "StockConsumption_kitchenId_productId_createdAt_idx" ON "StockConsumption"("kitchenId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "StockConsumptionLine_consumptionId_idx" ON "StockConsumptionLine"("consumptionId");

-- CreateIndex
CREATE INDEX "StockConsumptionLine_stockItemId_idx" ON "StockConsumptionLine"("stockItemId");

-- AddForeignKey
ALTER TABLE "StockConsumption" ADD CONSTRAINT "StockConsumption_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockConsumption" ADD CONSTRAINT "StockConsumption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockConsumption" ADD CONSTRAINT "StockConsumption_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockConsumption" ADD CONSTRAINT "StockConsumption_reversesConsumptionId_fkey" FOREIGN KEY ("reversesConsumptionId") REFERENCES "StockConsumption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockConsumptionLine" ADD CONSTRAINT "StockConsumptionLine_consumptionId_fkey" FOREIGN KEY ("consumptionId") REFERENCES "StockConsumption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockConsumptionLine" ADD CONSTRAINT "StockConsumptionLine_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
