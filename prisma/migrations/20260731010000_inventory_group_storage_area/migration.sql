ALTER TABLE "InventoryGroup" ADD COLUMN "storageArea" TEXT NOT NULL DEFAULT 'UNASSIGNED';

CREATE INDEX "InventoryGroup_storageArea_position_idx" ON "InventoryGroup"("storageArea", "position");
