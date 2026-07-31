CREATE TABLE IF NOT EXISTS "BranchDirectory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerCode" TEXT,
    "kvCustomerId" INTEGER,
    "canonicalName" TEXT NOT NULL,
    "rawName" TEXT,
    "warehouse" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "routeType" TEXT NOT NULL DEFAULT 'UNSPECIFIED',
    "day" TEXT,
    "sourceCell" TEXT,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'KNOWLEDGE_BASE',
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "BranchDirectory_customerCode_key" ON "BranchDirectory"("customerCode");
CREATE UNIQUE INDEX IF NOT EXISTS "BranchDirectory_kvCustomerId_key" ON "BranchDirectory"("kvCustomerId");
CREATE INDEX IF NOT EXISTS "BranchDirectory_warehouse_status_idx" ON "BranchDirectory"("warehouse", "status");
CREATE INDEX IF NOT EXISTS "BranchDirectory_canonicalName_idx" ON "BranchDirectory"("canonicalName");
CREATE INDEX IF NOT EXISTS "BranchDirectory_source_idx" ON "BranchDirectory"("source");

CREATE TABLE IF NOT EXISTS "BranchDirectoryAudit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "branchDirectoryId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "previousJson" TEXT,
    "nextJson" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'local-admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BranchDirectoryAudit_branchDirectoryId_fkey"
      FOREIGN KEY ("branchDirectoryId") REFERENCES "BranchDirectory" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "BranchDirectoryAudit_branchDirectoryId_createdAt_idx"
  ON "BranchDirectoryAudit"("branchDirectoryId", "createdAt");
CREATE INDEX IF NOT EXISTS "BranchDirectoryAudit_action_idx" ON "BranchDirectoryAudit"("action");
