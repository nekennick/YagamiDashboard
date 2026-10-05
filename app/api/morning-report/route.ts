import { NextResponse } from "next/server";
import { getMorningReport } from "@/lib/goclaw/morning-report";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getMorningReport(), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể tải báo cáo sáng.";
    return NextResponse.json({ message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
