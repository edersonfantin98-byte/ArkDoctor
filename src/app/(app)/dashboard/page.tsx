import { getDashboardOverviewAction } from "./actions";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { ExportReportButton } from "@/components/dashboard/export-report-button";
import { PageHeader } from "@/components/layout/page-header";

export default async function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const overview = await getDashboardOverviewAction(today);

  return (
    <div>
      <PageHeader
        title="Visão geral"
        description="Desempenho da clínica no mês atual."
        action={<ExportReportButton overview={overview} />}
      />
      <DashboardClient overview={overview} todayIso={today} />
    </div>
  );
}
