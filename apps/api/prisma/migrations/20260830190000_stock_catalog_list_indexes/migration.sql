-- Indeksy pod listowanie zapasów/katalogu (filtry + paginacja).
CREATE INDEX IF NOT EXISTS "Product_kitchenId_archivedAt_idx" ON "Product"("kitchenId", "archivedAt");
CREATE INDEX IF NOT EXISTS "StockItem_productId_quantity_idx" ON "StockItem"("productId", "quantity");
CREATE INDEX IF NOT EXISTS "StockItem_expiresAt_idx" ON "StockItem"("expiresAt");
