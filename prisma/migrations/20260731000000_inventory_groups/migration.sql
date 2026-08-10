CREATE TABLE "InventoryGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "InventoryGroup_name_key" ON "InventoryGroup"("name");
CREATE INDEX "InventoryGroup_position_idx" ON "InventoryGroup"("position");

CREATE TABLE "InventoryGroupProduct" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "groupId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryGroupProduct_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "InventoryGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryGroupProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InventoryGroupProduct_productId_key" ON "InventoryGroupProduct"("productId");
CREATE INDEX "InventoryGroupProduct_groupId_position_idx" ON "InventoryGroupProduct"("groupId", "position");
