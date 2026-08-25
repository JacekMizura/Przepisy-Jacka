-- One pending catalog product per shopping list (text items with productId IS NULL are excluded).
CREATE UNIQUE INDEX "ShoppingListItem_shoppingListId_productId_pending_key"
ON "ShoppingListItem" ("shoppingListId", "productId")
WHERE "status" = 'pending'
  AND "productId" IS NOT NULL
  AND "resolvedAt" IS NULL;
