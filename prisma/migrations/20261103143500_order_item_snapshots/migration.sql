-- AlterTable
ALTER TABLE "OrderItem"
ADD COLUMN "productName" TEXT NOT NULL DEFAULT '',
ADD COLUMN "productSku" TEXT NOT NULL DEFAULT '';

-- Backfill historical order item details from their products
UPDATE "OrderItem" AS item
SET
  "productName" = product."name",
  "productSku" = product."sku"
FROM "Product" AS product
WHERE item."productId" = product."id";
