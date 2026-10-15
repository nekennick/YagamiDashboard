import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(`DO $$ BEGIN
    CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "User" (
    "id" SERIAL PRIMARY KEY,
    "username" TEXT NOT NULL UNIQUE,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
  )`);
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "User_role_isActive_idx" ON "User" ("role", "isActive")');
  console.log("Bảng User đã sẵn sàng.");
} finally {
  await prisma.$disconnect();
}
