import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DatabaseUnavailable({ error }: { error?: unknown }) {
  const sqliteBusy = isSqliteBusyError(error);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">
          {sqliteBusy ? "Dữ liệu đang được cập nhật" : "Database chưa kết nối"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {sqliteBusy
            ? "SQLite đang bận ghi dữ liệu đồng bộ. Hãy chờ tác vụ hoàn tất rồi tải lại trang."
            : "Ứng dụng chưa thể kết nối tới database được cấu hình trong `DATABASE_URL`."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{sqliteBusy ? "Không cần khởi động lại ngay" : "Cách xử lý"}</CardTitle>
        </CardHeader>
        <CardContent>
          {sqliteBusy ? (
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
              <li>Đợi lượt đồng bộ hoặc báo cáo đang chạy hoàn tất.</li>
              <li>Tải lại trang chi tiết sản phẩm.</li>
              <li>Nếu trạng thái kéo dài quá 2 phút, dừng server rồi chạy lại để giải phóng phiên ghi bị kẹt.</li>
            </ol>
          ) : (
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
              <li>Kiểm tra file `.env` có `DATABASE_URL` trỏ đúng database.</li>
              <li>Với SQLite, xác nhận file `prisma/dev.db` vẫn tồn tại và có quyền đọc/ghi.</li>
              <li>Chạy lệnh chuẩn bị database rồi khởi động lại ứng dụng.</li>
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lệnh thường dùng</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-auto rounded-md bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
            {`npm.cmd run db:prepare
npm.cmd run dev`}
          </pre>
          {error ? <p className="mt-3 text-xs text-slate-500">{getErrorMessage(error)}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

export function isDatabaseConnectionError(error: unknown) {
  const message = getErrorMessage(error);
  return (
    message.includes("Can't reach database server") ||
    message.includes("connect ECONNREFUSED") ||
    message.includes("P1001") ||
    isSqliteBusyError(error)
  );
}

function isSqliteBusyError(error: unknown) {
  const message = getErrorMessage(error);
  const code = getErrorCode(error);

  return (
    code === "P1008" ||
    message.includes("P1008") ||
    /socket timeout|database failed to respond|database is locked|SQLITE_BUSY/i.test(message)
  );
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    return String(error.code);
  }

  return "";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
