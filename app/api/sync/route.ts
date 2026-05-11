import { NextRequest, NextResponse } from "next/server";
import { syncKiotViet, type SyncType } from "@/lib/kiotviet/sync";

const allowedTypes = new Set<SyncType>([
  "products",
  "customers",
  "branches",
  "invoices",
  "invoiceHistory",
  "inventory",
  "all"
]);

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { syncType?: SyncType };

    if (!body.syncType || !allowedTypes.has(body.syncType)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Loại đồng bộ không hợp lệ",
          results: []
        },
        { status: 400 }
      );
    }

    const results = await syncKiotViet(body.syncType);

    return NextResponse.json({
      ok: results.every((result) => result.status === "success"),
      message: "Đồng bộ hoàn tất",
      results
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Lỗi đồng bộ không xác định",
        results: []
      },
      { status: 500 }
    );
  }
}
