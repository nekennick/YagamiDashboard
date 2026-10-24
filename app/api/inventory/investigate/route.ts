import { NextResponse } from "next/server";
import { investigateDiscrepancy } from "@/lib/kiotviet/investigator";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { productId, branchId, operationalDate, adjustment } = body;

    if (!productId || !branchId || adjustment === undefined) {
      return NextResponse.json(
        { error: "Thiếu thông tin bắt buộc: productId, branchId, adjustment" },
        { status: 400 }
      );
    }

    const result = await investigateDiscrepancy({
      productId: Number(productId),
      branchId: Number(branchId),
      operationalDate: operationalDate ? String(operationalDate) : undefined,
      adjustment: Number(adjustment)
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Lỗi khi điều tra lệch kho:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lỗi hệ thống khi điều tra lệch kho" },
      { status: 500 }
    );
  }
}
