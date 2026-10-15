CREATE TABLE "InvoiceItemChange" (
    "id" SERIAL NOT NULL,
    "kvInvoiceId" INTEGER NOT NULL,
    "invoiceCode" TEXT,
    "branchId" INTEGER,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "productId" INTEGER,
    "productCode" TEXT,
    "productName" TEXT,
    "previousQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currentQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "inventoryDelta" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "previousStatus" TEXT,
    "currentStatus" TEXT,
    "changeType" TEXT NOT NULL,
    "sourceModifiedAt" TIMESTAMP(3),
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawJson" TEXT NOT NULL,
    CONSTRAINT "InvoiceItemChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvoiceItemChange_productId_branchId_detectedAt_idx"
  ON "InvoiceItemChange"("productId", "branchId", "detectedAt");
CREATE INDEX "InvoiceItemChange_kvInvoiceId_detectedAt_idx"
  ON "InvoiceItemChange"("kvInvoiceId", "detectedAt");
