import { NextRequest, NextResponse } from "next/server";
import { testKiotViet, type ApiTestKind } from "@/lib/kiotviet/client";

const allowedKinds = new Set<ApiTestKind>(["token", "products", "customers", "invoices", "orders", "inventory"]);

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { kind?: ApiTestKind };

    if (!body.kind || !allowedKinds.has(body.kind)) {
      return NextResponse.json(
        {
          ok: false,
          status: 400,
          message: "Loại kiểm tra API không hợp lệ",
          totalRecords: 0,
          preview: []
        },
        { status: 400 }
      );
    }

    const result = await testKiotViet(body.kind);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: 500,
        message: error instanceof Error ? error.message : "Lỗi kiểm tra API không xác định",
        totalRecords: 0,
        preview: []
      },
      { status: 500 }
    );
  }
}
