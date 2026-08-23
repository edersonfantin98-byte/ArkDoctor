import Link from "next/link";
import { Plus } from "lucide-react";
import { getDashboardMetricsAction } from "./actions";
import { FinanceDashboardClient } from "@/components/finance/finance-dashboard-client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

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
        title="Fluxo de caixa"
        description="Receita, despesa e desempenho por procedimento."
        action={
          <Button nativeButton={false} render={<Link href="/financeiro/lancamentos" />}>
            <Plus className="size-4" />
            Novo lançamento
          </Button>
        }
      />
      <FinanceDashboardClient initialMetrics={metrics} />
    </div>
  );
}
