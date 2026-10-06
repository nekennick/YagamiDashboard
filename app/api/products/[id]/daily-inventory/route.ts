import { NextRequest, NextResponse } from "next/server";
import { eachBusinessDate, getProductDailyInventory } from "@/lib/inventory-ledger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const productId = positiveInt(id);
    const branchId = positiveInt(request.nextUrl.searchParams.get("branchId"));
    const fromDate = validDate(request.nextUrl.searchParams.get("from"));
    const toDate = validDate(request.nextUrl.searchParams.get("to"));

    if (fromDate > toDate) {
      throw new Error("Ngày bắt đầu không được sau ngày kết thúc.");
    }
    if (eachBusinessDate(fromDate, toDate).length > 366) {
      throw new Error("Khoảng ngày tối đa là 366 ngày.");
    }

    const result = await getProductDailyInventory({ productId, branchId, fromDate, toDate });
    if (!result) {
      return NextResponse.json({ message: "Không tìm thấy sản phẩm hoặc kho." }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Không thể tải phân tích tồn kho theo ngày." },
      { status: 400 }
    );
  }
}

function positiveInt(value: string | null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("Mã sản phẩm hoặc kho không hợp lệ.");
  return parsed;
}

function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Ngày không hợp lệ.");
  eachBusinessDate(value, value);
  return value;
}
