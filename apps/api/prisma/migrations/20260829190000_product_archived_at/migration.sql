-- Soft-archive products instead of hard-deleting history-linked rows.
ALTER TABLE "Product" ADD COLUMN "archivedAt" TIMESTAMP(3);
