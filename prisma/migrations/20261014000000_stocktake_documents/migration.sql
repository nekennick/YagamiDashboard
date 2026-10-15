CREATE TABLE "StocktakeDocument" (
    "id" SERIAL NOT NULL,
    "kvStocktakeId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "kvBranchId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "status" INTEGER NOT NULL,
    "adjustmentDate" TIMESTAMP(3),
    "sourceCreatedAt" TIMESTAMP(3),
    "sourceModifiedAt" TIMESTAMP(3),
    "createdByName" TEXT,
    "description" TEXT,
    "rawJson" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StocktakeDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StocktakeLine" (
    "id" SERIAL NOT NULL,
    "kvStocktakeDetailId" INTEGER NOT NULL,
    "stocktakeDocumentId" INTEGER NOT NULL,
    "kvProductId" INTEGER NOT NULL,
    "productId" INTEGER,
    "productCode" TEXT,
    "productName" TEXT,
    "systemCount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualCount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "adjustmentValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rawJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StocktakeLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StocktakeDocument_kvStocktakeId_key" ON "StocktakeDocument"("kvStocktakeId");
CREATE UNIQUE INDEX "StocktakeDocument_code_key" ON "StocktakeDocument"("code");
CREATE INDEX "StocktakeDocument_branchId_adjustmentDate_idx" ON "StocktakeDocument"("branchId", "adjustmentDate");
CREATE INDEX "StocktakeDocument_status_adjustmentDate_idx" ON "StocktakeDocument"("status", "adjustmentDate");
CREATE UNIQUE INDEX "StocktakeLine_kvStocktakeDetailId_key" ON "StocktakeLine"("kvStocktakeDetailId");
CREATE INDEX "StocktakeLine_stocktakeDocumentId_isActive_idx" ON "StocktakeLine"("stocktakeDocumentId", "isActive");
CREATE INDEX "StocktakeLine_productId_isActive_idx" ON "StocktakeLine"("productId", "isActive");
CREATE INDEX "StocktakeLine_kvProductId_idx" ON "StocktakeLine"("kvProductId");
ALTER TABLE "StocktakeDocument" ADD CONSTRAINT "StocktakeDocument_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_stocktakeDocumentId_fkey" FOREIGN KEY ("stocktakeDocumentId") REFERENCES "StocktakeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
