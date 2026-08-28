-- Partii powiązanej z pozycją zakupu nie wolno fizycznie usuwać (historia zakupu/paragonu).
-- StockConsumptionLine już ma ON DELETE RESTRICT.
ALTER TABLE "PurchaseLineItem" DROP CONSTRAINT IF EXISTS "PurchaseLineItem_stockItemId_fkey";

ALTER TABLE "PurchaseLineItem"
  ADD CONSTRAINT "PurchaseLineItem_stockItemId_fkey"
  FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
