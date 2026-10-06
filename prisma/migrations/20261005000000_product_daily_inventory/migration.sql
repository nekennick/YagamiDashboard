-- Daily product inventory analysis and normalized stock movements.
CREATE TABLE "InventoryMovement" (
    "id" SERIAL NOT NULL,
    "movementKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "sourceLineKey" TEXT NOT NULL,
    "documentCode" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "productId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "quantityDelta" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT,
    "partnerName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rawJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductDailyInventoryEntry" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "businessDate" DATE NOT NULL,
    "openingOverride" DECIMAL(65,30),
    "actualOnHand" DECIMAL(65,30),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductDailyInventoryEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductDailyInventoryAudit" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "previousJson" TEXT,
    "nextJson" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'local-admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductDailyInventoryAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryMovement_movementKey_key" ON "InventoryMovement"("movementKey");
CREATE INDEX "InventoryMovement_productId_branchId_occurredAt_idx" ON "InventoryMovement"("productId", "branchId", "occurredAt");
CREATE INDEX "InventoryMovement_sourceType_sourceDocumentId_idx" ON "InventoryMovement"("sourceType", "sourceDocumentId");
CREATE INDEX "InventoryMovement_branchId_occurredAt_idx" ON "InventoryMovement"("branchId", "occurredAt");
CREATE UNIQUE INDEX "ProductDailyInventoryEntry_productId_branchId_businessDate_key" ON "ProductDailyInventoryEntry"("productId", "branchId", "businessDate");
CREATE INDEX "ProductDailyInventoryEntry_branchId_businessDate_idx" ON "ProductDailyInventoryEntry"("branchId", "businessDate");
CREATE INDEX "ProductDailyInventoryAudit_entryId_createdAt_idx" ON "ProductDailyInventoryAudit"("entryId", "createdAt");

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductDailyInventoryEntry" ADD CONSTRAINT "ProductDailyInventoryEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductDailyInventoryEntry" ADD CONSTRAINT "ProductDailyInventoryEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductDailyInventoryAudit" ADD CONSTRAINT "ProductDailyInventoryAudit_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ProductDailyInventoryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
