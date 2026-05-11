import { NextRequest, NextResponse } from "next/server";
import { getScheduleSettings, saveScheduleSettings, type ScheduledSyncType } from "@/lib/schedule";

export async function GET() {
  return NextResponse.json({
    ok: true,
    settings: await getScheduleSettings()
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      enabled?: boolean;
      intervalMinutes?: number;
      syncTypes?: ScheduledSyncType[];
    };
    const settings = await saveScheduleSettings({
      enabled: Boolean(body.enabled),
      intervalMinutes: Number(body.intervalMinutes ?? 60),
      syncTypes: Array.isArray(body.syncTypes) ? body.syncTypes : []
    });

    return NextResponse.json({
      ok: true,
      message: "Đã lưu lịch đồng bộ",
      settings
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Không thể lưu lịch đồng bộ"
      },
      { status: 500 }
    );
  }
}
