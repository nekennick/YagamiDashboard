import { Building2, CircleAlert, Database, ShieldCheck } from "lucide-react";
import { BranchDirectoryPanel } from "@/app/settings/branches/panel";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedPanel, FadeIn } from "@/components/ui/motion-primitives";
import { getBranchDirectoryOverview } from "@/lib/branch-directory";

export const dynamic = "force-dynamic";

export default async function BranchDirectoryPage() {
  try {
    const { managed, candidates, recentAudits } = await getBranchDirectoryOverview();
    const activeCount = managed.filter((branch) => branch.status === "ACTIVE").length;
    const likelyCount = candidates.filter((candidate) => candidate.likelyBranch).length;

    return (
      <div className="space-y-6">
        <FadeIn>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              Dữ liệu quản trị
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 dark:text-white">
              Danh mục chi nhánh
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
              Xác nhận khách hàng mới thành chi nhánh, chọn kho phụ trách và trạng thái. Mỗi lần lưu sẽ cập nhật database,
              lịch sử thay đổi và toàn bộ knowledge base dùng cho báo cáo.
            </p>
          </div>
        </FadeIn>

        <div className="grid gap-4 md:grid-cols-3">
          <AnimatedPanel delay={0.03}>
            <Metric icon={Building2} label="Chi nhánh đang hoạt động" value={activeCount} note="Được tính trong báo cáo vận hành." />
          </AnimatedPanel>
          <AnimatedPanel delay={0.06}>
            <Metric icon={CircleAlert} label="Khách chưa phân loại" value={candidates.length} note={`${likelyCount} tên có dấu hiệu là chi nhánh.`} />
          </AnimatedPanel>
          <AnimatedPanel delay={0.09}>
            <Metric icon={ShieldCheck} label="Lịch sử gần đây" value={recentAudits.length} note="Lưu trước và sau mỗi lần xác nhận." />
          </AnimatedPanel>
        </div>

        <AnimatedPanel delay={0.08}>
          <BranchDirectoryPanel
            candidates={candidates.map((candidate) => ({ ...candidate, updatedAt: candidate.updatedAt.toISOString() }))}
            managed={managed.map((branch) => ({
              ...branch,
              confirmedAt: branch.confirmedAt?.toISOString() ?? null,
              createdAt: branch.createdAt.toISOString(),
              updatedAt: branch.updatedAt.toISOString()
            }))}
            recentAudits={recentAudits.map((audit) => ({
              id: audit.id,
              action: audit.action,
              actor: audit.actor,
              createdAt: audit.createdAt.toISOString(),
              branchName: audit.branchDirectory.canonicalName,
              customerCode: audit.branchDirectory.customerCode
            }))}
          />
        </AnimatedPanel>
      </div>
    );
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return <DatabaseUnavailable error={error} />;
    }

    throw error;
  }
}

function Metric({
  icon: Icon,
  label,
  value,
  note
}: {
  icon: typeof Database;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <Card className="h-full">
      <CardContent className="space-y-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{formatNumber(value)}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{note}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}
