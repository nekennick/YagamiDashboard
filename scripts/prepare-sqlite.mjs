import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL ?? "";

if (!databaseUrl.startsWith("file:")) {
  process.exit(0);
}

const prisma = new PrismaClient();

try {
  const result = await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
  await prisma.$queryRawUnsafe("PRAGMA synchronous = NORMAL");
  await prisma.$queryRawUnsafe("PRAGMA wal_autocheckpoint = 1000");
  await ensureBranchDirectoryTables(prisma);
  await ensureInventoryGroupTables(prisma);
  const journalMode = Array.isArray(result) ? result[0]?.journal_mode : undefined;

  if (String(journalMode).toLowerCase() !== "wal") {
    throw new Error(`Khong the bat WAL cho SQLite (journal_mode=${String(journalMode)}).`);
  }

  console.log("SQLite da san sang: WAL, busy timeout 30 giay, mot ket noi ghi.");
} finally {
  await prisma.$disconnect();
}

async function ensureBranchDirectoryTables(client) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "BranchDirectory" (
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
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "BranchDirectory_customerCode_key" ON "BranchDirectory"("customerCode")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "BranchDirectory_kvCustomerId_key" ON "BranchDirectory"("kvCustomerId")`,
    `CREATE INDEX IF NOT EXISTS "BranchDirectory_warehouse_status_idx" ON "BranchDirectory"("warehouse", "status")`,
    `CREATE INDEX IF NOT EXISTS "BranchDirectory_canonicalName_idx" ON "BranchDirectory"("canonicalName")`,
    `CREATE INDEX IF NOT EXISTS "BranchDirectory_source_idx" ON "BranchDirectory"("source")`,
    `CREATE TABLE IF NOT EXISTS "BranchDirectoryAudit" (
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
    )`,
    `CREATE INDEX IF NOT EXISTS "BranchDirectoryAudit_branchDirectoryId_createdAt_idx" ON "BranchDirectoryAudit"("branchDirectoryId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "BranchDirectoryAudit_action_idx" ON "BranchDirectoryAudit"("action")`
  ];

  for (const statement of statements) {
    await client.$executeRawUnsafe(statement);
  }
}

async function ensureInventoryGroupTables(client) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "InventoryGroup" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "storageArea" TEXT NOT NULL DEFAULT 'UNASSIGNED',
      "position" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "InventoryGroup_name_key" ON "InventoryGroup"("name")`,
    `CREATE INDEX IF NOT EXISTS "InventoryGroup_position_idx" ON "InventoryGroup"("position")`,
    `CREATE TABLE IF NOT EXISTS "InventoryGroupProduct" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "groupId" INTEGER NOT NULL,
      "productId" INTEGER NOT NULL,
      "position" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "InventoryGroupProduct_groupId_fkey"
        FOREIGN KEY ("groupId") REFERENCES "InventoryGroup" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "InventoryGroupProduct_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "InventoryGroupProduct_productId_key" ON "InventoryGroupProduct"("productId")`,
    `CREATE INDEX IF NOT EXISTS "InventoryGroupProduct_groupId_position_idx" ON "InventoryGroupProduct"("groupId", "position")`
  ];

  for (const statement of statements) {
    await client.$executeRawUnsafe(statement);
  }

  const columns = await client.$queryRawUnsafe('PRAGMA table_info("InventoryGroup")');
  if (!Array.isArray(columns) || !columns.some((column) => column.name === "storageArea")) {
    await client.$executeRawUnsafe('ALTER TABLE "InventoryGroup" ADD COLUMN "storageArea" TEXT NOT NULL DEFAULT \'UNASSIGNED\'');
  }
  await client.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "InventoryGroup_storageArea_position_idx" ON "InventoryGroup"("storageArea", "position")');
}
