import { NextResponse } from "next/server";
import { runScheduledSyncNow } from "@/lib/schedule";

export async function POST() {
  try {
    const results = await runScheduledSyncNow();

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
