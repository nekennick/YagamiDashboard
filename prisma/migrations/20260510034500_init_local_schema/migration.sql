-- CreateTable
CREATE TABLE "Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kvProductId" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "fullName" TEXT,
    "categoryName" TEXT,
    "basePrice" DECIMAL DEFAULT 0,
    "cost" DECIMAL DEFAULT 0,
    "unit" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rawJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kvCustomerId" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "contactNumber" TEXT,
    "address" TEXT,
    "rawJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kvBranchId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "rawJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kvInvoiceId" INTEGER NOT NULL,
    "code" TEXT,
    "customerId" INTEGER,
    "branchId" INTEGER,
    "purchaseDate" DATETIME NOT NULL,
    "total" DECIMAL NOT NULL DEFAULT 0,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT,
    "rawJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "productId" INTEGER,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "price" DECIMAL NOT NULL DEFAULT 0,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "rawJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventorySnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snapshotDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "onHand" DECIMAL NOT NULL DEFAULT 0,
    "reserved" DECIMAL NOT NULL DEFAULT 0,
    "actualReserved" DECIMAL NOT NULL DEFAULT 0,
    "rawJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventorySnapshot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventorySnapshot_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "syncType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_kvProductId_key" ON "Product"("kvProductId");
CREATE INDEX "Product_code_idx" ON "Product"("code");
CREATE INDEX "Product_name_idx" ON "Product"("name");
CREATE INDEX "Product_categoryName_idx" ON "Product"("categoryName");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_kvCustomerId_key" ON "Customer"("kvCustomerId");
CREATE INDEX "Customer_code_idx" ON "Customer"("code");
CREATE INDEX "Customer_name_idx" ON "Customer"("name");
CREATE INDEX "Customer_contactNumber_idx" ON "Customer"("contactNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_kvBranchId_key" ON "Branch"("kvBranchId");
CREATE INDEX "Branch_name_idx" ON "Branch"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_kvInvoiceId_key" ON "Invoice"("kvInvoiceId");
CREATE INDEX "Invoice_code_idx" ON "Invoice"("code");
CREATE INDEX "Invoice_purchaseDate_idx" ON "Invoice"("purchaseDate");
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");
CREATE INDEX "Invoice_branchId_idx" ON "Invoice"("branchId");
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");
CREATE INDEX "InvoiceItem_productId_idx" ON "InvoiceItem"("productId");

-- CreateIndex
CREATE INDEX "InventorySnapshot_snapshotDate_idx" ON "InventorySnapshot"("snapshotDate");
CREATE INDEX "InventorySnapshot_productId_idx" ON "InventorySnapshot"("productId");
CREATE INDEX "InventorySnapshot_branchId_idx" ON "InventorySnapshot"("branchId");
CREATE INDEX "InventorySnapshot_productId_branchId_snapshotDate_idx" ON "InventorySnapshot"("productId", "branchId", "snapshotDate");

-- CreateIndex
CREATE INDEX "SyncLog_syncType_idx" ON "SyncLog"("syncType");
CREATE INDEX "SyncLog_status_idx" ON "SyncLog"("status");
CREATE INDEX "SyncLog_startedAt_idx" ON "SyncLog"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");
