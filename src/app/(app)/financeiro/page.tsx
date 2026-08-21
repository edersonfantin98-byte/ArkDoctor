import { getDashboardMetricsAction } from "./actions";
import { FinanceDashboardClient } from "@/components/finance/finance-dashboard-client";
import { PageHeader } from "@/components/layout/page-header";

function currentMonthRange() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default async function FinancePage() {
  const metrics = await getDashboardMetricsAction(currentMonthRange());

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Receita, despesa e desempenho por procedimento."
      />
      <FinanceDashboardClient initialMetrics={metrics} />
    </div>
  );
}
