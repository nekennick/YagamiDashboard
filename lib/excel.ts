import ExcelJS from "exceljs";

type ExcelColumn = {
  header: string;
  key: string;
  width?: number;
};

export async function createWorkbookBuffer({
  sheetName,
  columns,
  rows
}: {
  sheetName: string;
  columns: ExcelColumn[];
  rows: Record<string, unknown>[];
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Yagami Dashboard";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.columns = columns;
  worksheet.addRows(rows);
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).alignment = { vertical: "middle" };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: columns.length }
  };

  return workbook.xlsx.writeBuffer();
}

export function excelResponse(buffer: Awaited<ReturnType<typeof createWorkbookBuffer>>, filename: string) {
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
