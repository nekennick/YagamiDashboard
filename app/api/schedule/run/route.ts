import { NextResponse } from "next/server";
import { runScheduledSyncNow, type ScheduleGroupId } from "@/lib/schedule";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { groupId?: ScheduleGroupId };
    const results = await runScheduledSyncNow(body.groupId);

    return NextResponse.json({
      ok: results.every((result) => result.status === "success"),
      message: "Đã chạy lịch đồng bộ",
      results
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Không thể chạy lịch đồng bộ",
        results: []
      },
      { status: 500 }
    );
  }
}
