-- CreateEnum
CREATE TYPE "ProductPurchaseMode" AS ENUM ('unconfigured', 'packaged', 'exact');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "purchaseMode" "ProductPurchaseMode" NOT NULL DEFAULT 'unconfigured';

-- Existing products with at least one purchase option become packaged.
-- Products without options stay unconfigured (never auto-exact).
UPDATE "Product" AS p
SET "purchaseMode" = 'packaged'
WHERE EXISTS (
  SELECT 1
  FROM "ProductPurchaseOption" o
  WHERE o."productId" = p.id
);
