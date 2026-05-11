import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DatabaseUnavailable({ error }: { error?: unknown }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Database chưa kết nối</h1>
        <p className="mt-2 text-sm text-slate-600">
          Ứng dụng đã chuyển sang PostgreSQL, nhưng hiện chưa kết nối được database tại cấu hình `DATABASE_URL`.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cách xử lý</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>Cài và chạy PostgreSQL local, hoặc dùng connection string PostgreSQL cloud.</li>
            <li>Tạo database `yagami_dashboard` nếu dùng cấu hình mặc định.</li>
            <li>Kiểm tra `.env` có `DATABASE_URL` trỏ đúng PostgreSQL.</li>
            <li>Chạy `npm.cmd run prisma:migrate` rồi sync lại dữ liệu KiotViet.</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lệnh thường dùng</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-auto rounded-md bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
            {`createdb yagami_dashboard
npm.cmd run prisma:migrate
npm.cmd run prisma:generate
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
    message.includes("P1001")
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
