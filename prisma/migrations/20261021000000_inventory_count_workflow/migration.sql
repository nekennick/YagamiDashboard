CREATE TYPE "InventoryCountPermission" AS ENUM ('COUNT_EXECUTE', 'COUNT_MANAGE', 'COUNT_BALANCE');
CREATE TYPE "InventoryCountSessionStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'RETURNED', 'APPROVED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "InventoryCountLineStatus" AS ENUM ('COUNTING', 'AWAITING_DECISION', 'QUEUED', 'NO_ADJUSTMENT', 'BALANCED', 'DISMISSED', 'CANCELLED');
CREATE TYPE "InventoryBalanceBatchStatus" AS ENUM ('PENDING', 'VALIDATING', 'REMOTE_DRAFT', 'BALANCING', 'BALANCED_SYNC_PENDING', 'BALANCED', 'STALE', 'REMOTE_DRAFT_STALE', 'FAILED_RETRYABLE', 'CANCELLED');

CREATE TABLE "UserPermission" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "permission" "InventoryCountPermission" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryCountAssignment" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "assigneeId" INTEGER NOT NULL,
    "assignedById" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryCountAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryCountAssignmentAudit" (
    "id" SERIAL NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "previousJson" TEXT,
    "nextJson" TEXT NOT NULL,
    "actorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryCountAssignmentAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryCountSession" (
    "id" TEXT NOT NULL,
    "branchId" INTEGER NOT NULL,
    "assigneeId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "reviewedById" INTEGER,
    "status" "InventoryCountSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "returnReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryCountSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryCountLine" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "actualCount" DECIMAL(65,30),
    "countedAt" TIMESTAMP(3),
    "systemOnHandAtSubmit" DECIMAL(65,30),
    "difference" DECIMAL(65,30),
    "inventoryVersionAtSubmit" INTEGER,
    "status" "InventoryCountLineStatus" NOT NULL DEFAULT 'COUNTING',
    "activeLockKey" TEXT,
    "resolutionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryCountLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryPositionVersion" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryPositionVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryBalanceBatch" (
    "id" TEXT NOT NULL,
    "branchId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "status" "InventoryBalanceBatchStatus" NOT NULL DEFAULT 'PENDING',
    "marker" TEXT NOT NULL,
    "kvStocktakeId" INTEGER,
    "kvStocktakeCode" TEXT,
    "kvStocktakeUuid" TEXT,
    "remoteDraftAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "balancedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryBalanceBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryBalanceBatchLine" (
    "id" SERIAL NOT NULL,
    "batchId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "actualCountSnapshot" DECIMAL(65,30) NOT NULL,
    "systemOnHandSnapshot" DECIMAL(65,30) NOT NULL,
    "differenceSnapshot" DECIMAL(65,30) NOT NULL,
    "inventoryVersionSnapshot" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryBalanceBatchLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryCountAudit" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" INTEGER,
    "payloadJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryCountAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserPermission_userId_permission_key" ON "UserPermission"("userId", "permission");
CREATE INDEX "UserPermission_permission_userId_idx" ON "UserPermission"("permission", "userId");
CREATE UNIQUE INDEX "InventoryCountAssignment_productId_branchId_key" ON "InventoryCountAssignment"("productId", "branchId");
CREATE INDEX "InventoryCountAssignment_assigneeId_isActive_idx" ON "InventoryCountAssignment"("assigneeId", "isActive");
CREATE INDEX "InventoryCountAssignment_branchId_isActive_idx" ON "InventoryCountAssignment"("branchId", "isActive");
CREATE INDEX "InventoryCountAssignmentAudit_assignmentId_createdAt_idx" ON "InventoryCountAssignmentAudit"("assignmentId", "createdAt");
CREATE INDEX "InventoryCountSession_assigneeId_status_createdAt_idx" ON "InventoryCountSession"("assigneeId", "status", "createdAt");
CREATE INDEX "InventoryCountSession_branchId_status_createdAt_idx" ON "InventoryCountSession"("branchId", "status", "createdAt");
CREATE UNIQUE INDEX "InventoryCountLine_sessionId_productId_key" ON "InventoryCountLine"("sessionId", "productId");
CREATE UNIQUE INDEX "InventoryCountLine_activeLockKey_key" ON "InventoryCountLine"("activeLockKey");
CREATE INDEX "InventoryCountLine_productId_status_idx" ON "InventoryCountLine"("productId", "status");
CREATE INDEX "InventoryCountLine_sessionId_status_idx" ON "InventoryCountLine"("sessionId", "status");
CREATE UNIQUE INDEX "InventoryPositionVersion_productId_branchId_key" ON "InventoryPositionVersion"("productId", "branchId");
CREATE INDEX "InventoryPositionVersion_branchId_changedAt_idx" ON "InventoryPositionVersion"("branchId", "changedAt");
CREATE UNIQUE INDEX "InventoryBalanceBatch_marker_key" ON "InventoryBalanceBatch"("marker");
CREATE INDEX "InventoryBalanceBatch_branchId_status_createdAt_idx" ON "InventoryBalanceBatch"("branchId", "status", "createdAt");
CREATE UNIQUE INDEX "InventoryBalanceBatchLine_lineId_key" ON "InventoryBalanceBatchLine"("lineId");
CREATE INDEX "InventoryBalanceBatchLine_batchId_idx" ON "InventoryBalanceBatchLine"("batchId");
CREATE INDEX "InventoryCountAudit_entityType_entityId_createdAt_idx" ON "InventoryCountAudit"("entityType", "entityId", "createdAt");
CREATE INDEX "InventoryCountAudit_actorId_createdAt_idx" ON "InventoryCountAudit"("actorId", "createdAt");

ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCountAssignment" ADD CONSTRAINT "InventoryCountAssignment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountAssignment" ADD CONSTRAINT "InventoryCountAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountAssignment" ADD CONSTRAINT "InventoryCountAssignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountAssignment" ADD CONSTRAINT "InventoryCountAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountAssignmentAudit" ADD CONSTRAINT "InventoryCountAssignmentAudit_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "InventoryCountAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCountSession" ADD CONSTRAINT "InventoryCountSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountSession" ADD CONSTRAINT "InventoryCountSession_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountSession" ADD CONSTRAINT "InventoryCountSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountSession" ADD CONSTRAINT "InventoryCountSession_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InventoryCountSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryPositionVersion" ADD CONSTRAINT "InventoryPositionVersion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryPositionVersion" ADD CONSTRAINT "InventoryPositionVersion_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryBalanceBatch" ADD CONSTRAINT "InventoryBalanceBatch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBalanceBatch" ADD CONSTRAINT "InventoryBalanceBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBalanceBatchLine" ADD CONSTRAINT "InventoryBalanceBatchLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBalanceBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryBalanceBatchLine" ADD CONSTRAINT "InventoryBalanceBatchLine_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "InventoryCountLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountAudit" ADD CONSTRAINT "InventoryCountAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
