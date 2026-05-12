import { createWorkbookBuffer, excelResponse } from "@/lib/excel";
import { formatMonthLabel, getProductBranchMonthlyRows, parseMonthRange } from "@/lib/analytics/product-branch-monthly";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category")?.trim() ?? "";
  const branch = searchParams.get("branch")?.trim() ?? "";
  const branchId = branch ? Number(branch) : undefined;
  const monthRange = parseMonthRange(searchParams.get("fromMonth")?.trim() ?? "", searchParams.get("toMonth")?.trim() ?? "");
  const rows = await getProductBranchMonthlyRows({
    fromDate: monthRange.fromDate,
    toDate: monthRange.toDate,
    branchId,
    category,
    query,
    limit: 5000
  });
  const buffer = await createWorkbookBuffer({
    sheetName: "SP chi nhanh thang",
    columns: [
      { header: "Tháng", key: "month", width: 14 },
      { header: "Mã sản phẩm", key: "productCode", width: 18 },
      { header: "Sản phẩm", key: "productName", width: 36 },
      { header: "Nhóm hàng", key: "categoryName", width: 24 },
      { header: "Đơn vị", key: "unit", width: 12 },
      { header: "Chi nhánh", key: "branchName", width: 24 },
      { header: "Số lượng", key: "quantity", width: 14 },
      { header: "Doanh thu", key: "revenue", width: 16 },
      { header: "Hóa đơn", key: "invoiceCount", width: 12 }
    ],
    rows: rows.map((row) => ({
      month: formatMonthLabel(row.month),
      productCode: row.productCode ?? "",
      productName: row.productName,
      categoryName: row.categoryName ?? "",
      unit: row.unit ?? "",
      branchName: row.branchName ?? "Không rõ chi nhánh",
      quantity: row.quantity,
      revenue: row.revenue,
      invoiceCount: row.invoiceCount
    }))
  });

  return excelResponse(buffer, `product-branch-monthly-${formatDateForFilename(new Date())}.xlsx`);
}

function formatDateForFilename(date: Date) {
  return date.toISOString().slice(0, 10);
}
