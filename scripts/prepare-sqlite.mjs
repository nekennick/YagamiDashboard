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
  const journalMode = Array.isArray(result) ? result[0]?.journal_mode : undefined;

  if (String(journalMode).toLowerCase() !== "wal") {
    throw new Error(`Khong the bat WAL cho SQLite (journal_mode=${String(journalMode)}).`);
  }

  console.log("SQLite da san sang: WAL, busy timeout 30 giay, mot ket noi ghi.");
} finally {
  await prisma.$disconnect();
}
