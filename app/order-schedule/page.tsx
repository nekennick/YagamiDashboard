import { MorningReportView } from "@/components/orders/morning-report-view";
import { getMorningReport } from "@/lib/goclaw/morning-report";

export const dynamic = "force-dynamic";

export default async function OrderSchedulePage() {
  const report = await getMorningReport().catch(() => null);
  return <MorningReportView initialReport={report} />;
}
