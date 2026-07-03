import { Card, CardContent, CardHeader } from "@/components/ui/card";

type PageLoadingProps = {
  title?: string;
  description?: string;
  metricCount?: number;
  columns?: number;
  rows?: number;
};

export function PageLoading({
  title = "Đang tải dữ liệu",
  description = "Hệ thống đang đọc dữ liệu local.",
  metricCount = 4,
  columns = 6,
  rows = 8
}: PageLoadingProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
          <div className="mt-3 h-8 w-56 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" aria-label={title} />
          <div className="mt-3 h-4 w-[min(520px,80vw)] animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" aria-label={description} />
        </div>
        <div className="h-10 w-28 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: metricCount }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <div className="h-4 w-28 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-32 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="h-5 w-24 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
        </CardHeader>
        <CardContent>
          <div className="h-10 w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="h-5 w-36 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-hidden">
            <div className="grid gap-3 border-y border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {Array.from({ length: columns }).map((_, index) => (
                <div key={index} className="h-4 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
              ))}
            </div>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <div
                className="grid gap-3 border-b border-slate-100 px-5 py-5 last:border-0 dark:border-slate-800"
                key={rowIndex}
                style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: columns }).map((_, columnIndex) => (
                  <div
                    className="h-4 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800"
                    key={columnIndex}
                    style={{ opacity: columnIndex === 0 ? 0.65 : 1 }}
                  />
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
