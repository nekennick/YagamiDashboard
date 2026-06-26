import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const since = request.nextUrl.searchParams.get("since");
  const sinceDate = since ? new Date(since) : null;

  const logs = await prisma.syncLog.findMany({
    where: sinceDate && !Number.isNaN(sinceDate.getTime()) ? { startedAt: { gte: sinceDate } } : undefined,
    orderBy: { startedAt: "desc" },
    take: 20
  });

  return NextResponse.json({
    logs: logs.map((log) => ({
      id: String(log.id),
      syncType: log.syncType,
      status: log.status,
      startedAt: log.startedAt.toISOString(),
      finishedAt: log.finishedAt?.toISOString() ?? null,
      totalRecords: log.totalRecords,
      errorMessage: log.errorMessage
    }))
  });
}
