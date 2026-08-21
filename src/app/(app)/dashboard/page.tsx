import { getDashboardOverviewAction } from "./actions";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { PageHeader } from "@/components/layout/page-header";

export default async function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const overview = await getDashboardOverviewAction(today);

  return (
    <div>
      <PageHeader title="Visão geral" description="Desempenho da clínica no mês atual." />
      <DashboardClient overview={overview} />
    </div>
  );
}
