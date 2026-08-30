-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN "packageCount" INTEGER,
ADD COLUMN "packageQuantitySnapshot" DECIMAL(12,3),
ADD COLUMN "packageUnitSnapshot" "PackageContentUnit";
