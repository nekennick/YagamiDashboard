import { NextResponse } from "next/server";
import { confirmBranchDirectory, exportBranchKnowledgeBase } from "@/lib/branch-directory";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    if (body.action === "export") {
      const result = await exportBranchKnowledgeBase();
      return NextResponse.json({
        message: `Đã xuất ${result.records} chi nhánh vào knowledge base phiên bản ${result.version}.`,
        result
      });
    }

    const branch = await confirmBranchDirectory({
      id: toOptionalNumber(body.id),
      kvCustomerId: toOptionalNumber(body.kvCustomerId),
      customerCode: typeof body.customerCode === "string" ? body.customerCode : undefined,
      canonicalName: String(body.canonicalName ?? ""),
      rawName: typeof body.rawName === "string" ? body.rawName : undefined,
      warehouse: String(body.warehouse ?? ""),
      status: String(body.status ?? ""),
      notes: typeof body.notes === "string" ? body.notes : undefined
    });

    return NextResponse.json({ message: `Đã xác nhận ${branch.canonicalName} và cập nhật knowledge base.`, branch });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể cập nhật danh mục chi nhánh.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

function toOptionalNumber(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}
