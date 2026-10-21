import { NextRequest, NextResponse } from "next/server";
import { InventoryCountAccessError, requireInventoryCountPermission } from "@/lib/auth/inventory-count";
import { AssignmentManagementError, mergeAssignmentGroups } from "@/lib/inventory-count/assignment-management";
import { readAssignmentWorkbook, resolveAssignmentImport, type AssignmentImportRow } from "@/lib/inventory-count/assignment-import";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const actor = await requireInventoryCountPermission("COUNT_MANAGE");
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) return NextResponse.json({ message: "Chọn file Excel cần nhập." }, { status: 400 });
      if (file.size > MAX_FILE_SIZE) return NextResponse.json({ message: "File Excel không được vượt quá 5 MB." }, { status: 400 });
      if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) return NextResponse.json({ message: "Chỉ hỗ trợ file Excel .xlsx." }, { status: 400 });
      const parsed = await readAssignmentWorkbook(await file.arrayBuffer());
      const preview = await resolveAssignmentImport(parsed.rows, parsed.errors);
      return NextResponse.json(preview);
    }

    const body = await request.json() as { rows?: AssignmentImportRow[] };
    if (!Array.isArray(body.rows) || !body.rows.length) return NextResponse.json({ message: "Không có dữ liệu Excel để áp dụng." }, { status: 400 });
    const safeRows = body.rows.slice(0, 5001).map((row, index) => ({
      rowNumber: Number.isInteger(row.rowNumber) && row.rowNumber > 1 ? row.rowNumber : index + 2,
      branchName: String(row.branchName ?? ""),
      username: String(row.username ?? ""),
      productCode: String(row.productCode ?? "")
    }));
    const preview = await resolveAssignmentImport(safeRows);
    if (!preview.canApply) return NextResponse.json({ message: "Dữ liệu đã thay đổi hoặc còn lỗi; chưa áp dụng phân công.", ...preview }, { status: 409 });
    const result = await mergeAssignmentGroups(preview.groups, actor.sub);
    return NextResponse.json({ ...result, summaries: preview.summaries });
  } catch (error) {
    const status = error instanceof InventoryCountAccessError || error instanceof AssignmentManagementError ? error.status : 400;
    const details = error instanceof AssignmentManagementError ? error.details : undefined;
    return NextResponse.json({ message: error instanceof Error ? error.message : "Không thể nhập danh sách phân công.", ...details }, { status });
  }
}
